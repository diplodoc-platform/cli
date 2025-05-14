import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';
import type {Toc} from '~/core/toc';

import {dirname, join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {defined} from '~/core/config';
import {Template} from '~/core/template';
import {copyJson, normalizePath} from '~/core/utils';

import {options} from './config';
import {getSinglePageUrl, joinSinglePageResults} from './utils';

const SINGLE_PAGE_FILENAME = 'single-page.html';

const SINGLE_PAGE_DATA_FILENAME = 'single-page.json';

export type SinglePageArgs = {
    singlePage: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
};

type PageInfo = {
    path: NormalizedPath;
    content: string;
    title: string;
};

const __SinglePage__ = Symbol('isSinglePage');

export class SinglePage {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('SinglePage', (command: Command) => {
            command.addOption(options.singlePage);
        });

        getBaseHooks(program).Config.tap('SinglePage', (config, args) => {
            config.singlePage = defined('singlePage', args, config) || false;

            return config;
        });

        const results: Record<NormalizedPath, PageInfo[]> = {};

        getBuildHooks(program)
            .Entry.for('html')
            .tap('SinglePage', (run, entry, info) => {
                if (!run.config.singlePage || !info.html) {
                    return;
                }

                const tocDir = normalizePath(dirname(run.toc.for(entry)));

                results[tocDir] = results[tocDir] || [];
                results[tocDir][info.position] = {
                    path: entry,
                    content: info.html,
                    title: info.title || '',
                    // TODO: handle file resources
                };
            });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('SinglePage', (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                // Modify and dump toc for single page.
                // Add link to dumped single-page-toc.js to html template.
                getEntryHooks(run.entry).Page.tapPromise('Html', async (template) => {
                    if (!template.is(__SinglePage__)) {
                        return;
                    }

                    const tocPath = run.toc.for(template.path);
                    const file = join(dirname(tocPath), 'single-page-toc.js');

                    const toc = copyJson(await run.toc.dump(tocPath));
                    await run.toc.walkEntries([toc as {href: NormalizedPath}], (item) => {
                        item.href = getSinglePageUrl(dirname(toc.path), item.href);

                        return item;
                    });

                    template.addScript(file, {position: 'state'});

                    await run.write(
                        join(run.output, file),
                        `window.__DATA__.data.toc = ${JSON.stringify(toc)};`,
                    );
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SinglePage', async (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                for (const entry of Object.entries(results)) {
                    const [tocDir, result] = entry as [NormalizedPath, PageInfo[]];

                    if (!result.length) {
                        return;
                    }

                    const tocPath = join(tocDir, 'toc.yaml');
                    const htmlPath = join(tocDir, SINGLE_PAGE_FILENAME);
                    const dataPath = join(tocDir, SINGLE_PAGE_DATA_FILENAME);

                    try {
                        const singlePageBody = joinSinglePageResults(
                            result.filter(Boolean),
                            tocDir as NormalizedPath,
                        );

                        const toc = (await run.toc.dump(tocPath)) as Toc;

                        const data = {
                            leading: false as const,
                            html: singlePageBody,
                            headings: [],
                            meta: run.config.resources,
                            title: toc.title || '',
                        };

                        const state = await run.entry.state(htmlPath, data);
                        const template = new Template(htmlPath, state.lang, [__SinglePage__]);
                        const page = await run.entry.page(template, state, toc);

                        await run.write(join(run.output, dataPath), JSON.stringify(state));
                        await run.write(join(run.output, htmlPath), page);
                    } catch (error) {
                        run.logger.error(error);
                    }
                }
            });
    }
}
