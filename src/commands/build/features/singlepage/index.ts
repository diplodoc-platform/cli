import type {Build} from '~/commands/build';
import type {EntryTocItem} from '~/core/toc';
import type {Command} from '~/core/config';
import type {SinglePageResult} from './utils';

import {dirname, join} from 'node:path';

import {options} from './config';
import {SINGLE_PAGE_FILENAME, getSinglePageUrl, joinSinglePageResults} from './utils';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks, getEntryHooks} from '~/commands/build';
import {defined} from '~/core/config';
import {Template} from '~/core/template';
import {normalizePath} from '~/core/utils';


const SINGLE_PAGE_DATA_FILENAME = 'single-page.json';

export type SinglePageArgs = {
    singlePage: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
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

        const results: Record<NormalizedPath, SinglePageResult> = {};

        getBuildHooks(program)
            .Entry.for('html')
            .tap('SinglePage', (run, entry, info) => {
                if (!run.config.singlePage || !info.html) {
                    return;
                }

                const toc = run.toc.for(entry);
                const meta = info.meta || {};

                run.meta.addMetadata(toc.path, meta.metadata);
                run.meta.addResources(toc.path, meta);

                results[entry] = results[entry] || [];
                results[entry] = {
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

                    const file = join(dirname(template.path), 'single-page-toc.js');

                    const tocPath = join(dirname(template.path), 'toc.yaml');
                    const toc = (await run.toc.dump(tocPath)).copy(file);
                    await run.toc.walkEntries([toc.data as {href: NormalizedPath}], (item) => {
                        item.href = getSinglePageUrl(
                            dirname(toc.path),
                            item.href,
                            SINGLE_PAGE_FILENAME,
                        );

                        return item;
                    });

                    template.addScript(file, {position: 'state'});

                    await run.write(join(run.output, toc.path), toc.toString(), true);
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SinglePage', async (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                for (const toc of run.toc.tocs) {
                    const entries: SinglePageResult[] = [];
                    await run.toc.walkEntries([toc as unknown as EntryTocItem], (item) => {
                        const rebasedItemHref = normalizePath(join(dirname(toc.path), item.href));

                        entries.push(results[rebasedItemHref]);

                        return item;
                    });

                    if (!entries.length) {
                        return;
                    }

                    const tocDir = dirname(toc.path);
                    const htmlPath = join(tocDir, SINGLE_PAGE_FILENAME);
                    const dataPath = join(tocDir, SINGLE_PAGE_DATA_FILENAME);

                    try {
                        const singlePageBody = joinSinglePageResults(
                            entries.filter(Boolean),
                            tocDir as NormalizedPath,
                        );

                        const tocData = (await run.toc.dump(toc.path, toc)).data;

                        run.meta.addResources(toc.path, run.config.resources);

                        const data = {
                            leading: false as const,
                            html: singlePageBody,
                            headings: [],
                            meta: await run.meta.dump(toc.path),
                            title: toc.title || '',
                        };

                        const state = await run.entry.state(htmlPath, data);
                        const template = new Template(htmlPath, state.lang, [__SinglePage__]);
                        const page = await run.entry.page(template, state, tocData);

                        state.data.toc = tocData;

                        await run.write(join(run.output, dataPath), JSON.stringify(state), true);
                        await run.write(join(run.output, htmlPath), page, true);
                    } catch (error) {
                        run.logger.error(error);
                    }
                }
            });
    }
}
