import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {dirname, join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {defined} from '~/core/config';
import {Template} from '~/core/template';

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

                const tocPath = run.toc.for(entry);

                run.meta.add(tocPath, info.meta || {});
                run.meta.addResources(tocPath, info.meta || {});

                results[tocPath] = results[tocPath] || [];
                results[tocPath][info.position] = {
                    path: entry,
                    content: info.html,
                    title: info.title || '',
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

                    const toc = (await run.toc.dump(tocPath)).copy(file);
                    await run.toc.walkEntries([toc.data as {href: NormalizedPath}], (item) => {
                        item.href = getSinglePageUrl(dirname(toc.path), item.href);

                        return item;
                    });

                    template.addScript(file, {position: 'state'});

                    await run.write(join(run.output, toc.path), toc.toString());
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SinglePage', async (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                for (const entry of Object.entries(results)) {
                    const [tocPath, result] = entry as [NormalizedPath, PageInfo[]];

                    if (!result.length) {
                        return;
                    }

                    const tocDir = dirname(tocPath);
                    const htmlPath = join(tocDir, SINGLE_PAGE_FILENAME);
                    const dataPath = join(tocDir, SINGLE_PAGE_DATA_FILENAME);

                    try {
                        const singlePageBody = joinSinglePageResults(
                            result.filter(Boolean),
                            tocDir as NormalizedPath,
                        );

                        const toc = (await run.toc.dump(tocPath)).data;

                        run.meta.addResources(tocPath, run.config.resources);

                        const data = {
                            leading: false as const,
                            html: singlePageBody,
                            headings: [],
                            meta: await run.meta.dump(tocPath),
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
