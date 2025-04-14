import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';
import type {EntryTocItem, Toc} from '~/core/toc';

import {dirname, join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {defined} from '~/core/config';
import {copyJson, normalizePath} from '~/core/utils';
import {getDepth, getDepthPath} from '~/utils';
import {Lang} from '~/constants';
import {generateStaticMarkup} from '~/pages';

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
            .BeforeRun.for('html')
            .tap('SinglePage', (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                getBuildHooks(program)
                    .Entry.for('html')
                    .tap('SinglePage', (entry, info) => {
                        if (!info.html) {
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

                getTocHooks(run.toc).Resolved.tapPromise('SinglePage', async (toc, path) => {
                    const copy = copyJson(toc);
                    await run.toc.walkEntries([copy as EntryTocItem], (item) => {
                        item.href = getSinglePageUrl(dirname(path), item.href);

                        return item;
                    });

                    const file = join(run.output, dirname(path), 'single-page-toc.js');

                    await run.write(file, `window.__DATA__.data.toc = ${JSON.stringify(copy)};`);
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SinglePage', async (run) => {
                if (!run.config.singlePage) {
                    return;
                }

                for (const [tocDir, result] of Object.entries(results)) {
                    if (!result.length) {
                        return;
                    }

                    try {
                        const singlePageBody = joinSinglePageResults(
                            result.filter(Boolean),
                            tocDir as NormalizedPath,
                        );

                        const toc = (await run.toc.dump(
                            join(tocDir as NormalizedPath, 'toc.yaml'),
                        )) as Toc;
                        const lang = run.config.lang ?? Lang.RU;
                        const langs = run.config.langs.length ? run.config.langs : [lang];
                        const depth = getDepth(tocDir) + 1;

                        const pageData = {
                            data: {
                                leading: false as const,
                                html: singlePageBody,
                                headings: [],
                                meta: run.config.resources,
                                title: toc.title || '',
                            },
                            router: {
                                pathname: SINGLE_PAGE_FILENAME,
                                depth,
                                base: getDepthPath(depth - 1),
                            },
                            lang,
                            langs,
                        };

                        // Save the full single page for viewing locally
                        const singlePageFn = join(run.output, tocDir, SINGLE_PAGE_FILENAME);
                        const singlePageDataFn = join(
                            run.output,
                            tocDir,
                            SINGLE_PAGE_DATA_FILENAME,
                        );
                        const singlePageContent = generateStaticMarkup(
                            pageData,
                            join(tocDir, 'single-page-toc'),
                            (toc.title as string) || '',
                        );

                        await run.write(singlePageFn, singlePageContent);
                        await run.write(singlePageDataFn, JSON.stringify(pageData));
                    } catch (error) {
                        run.logger.error(error);
                    }
                }
            });
    }
}
