import type {DocInnerProps} from '@diplodoc/client';
import type {Run} from '~/commands/build';
import {join} from 'node:path';
import {existsSync} from 'fs';
import {asyncify, mapLimit} from 'async';
import {bold} from 'chalk';

import {
    Lang,
    PAGE_PROCESS_CONCURRENCY,
    SINGLE_PAGE_DATA_FILENAME,
    SINGLE_PAGE_FILENAME,
} from '../constants';
import {SinglePageResult} from '../models';
import {resolveToHtml, resolveToMd} from '../resolvers';
import {PluginService} from '../services';
import {generateStaticMarkup} from '~/pages/document';
import {generateStaticRedirect} from '~/pages/redirect';
import {getDepth, getDepthPath, joinSinglePageResults} from '../utils';
import {normalizePath} from '~/core/utils';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(run: Run): Promise<void> {
    const {outputFormat, singlePage} = run.config;

    PluginService.setPlugins();

    await mapLimit(
        run.toc.entries,
        PAGE_PROCESS_CONCURRENCY,
        asyncify(async (path: NormalizedPath) => {
            run.logger.proc(path);

            const info = await preparingPagesByOutputFormat(run, path);

            if (outputFormat === 'html') {
                await run.search.add(path, info.lang, info.data);

                if (singlePage) {
                    savePageResultForSinglePage(info, path, run.toc.dir(path));
                }
            }
        }),
    );

    if (singlePage) {
        await saveSinglePages(run);
    }

    if (run.config.outputFormat === 'html') {
        await saveRedirectPage(run);
    }
}

async function saveSinglePages(run: Run) {
    try {
        await Promise.all(
            Object.keys(singlePageResults).map(async (tocDir) => {
                if (!singlePageResults[tocDir].length) {
                    return;
                }

                const relativeTocDir = tocDir.replace(/\\/g, '/').replace(/^\/?/, '');
                const singlePageBody = joinSinglePageResults(
                    singlePageResults[tocDir],
                    relativeTocDir,
                );

                const tocPath = run.toc.for(join(relativeTocDir, 'toc.yaml'));
                const toc = await run.toc.dump(tocPath);
                const lang = run.config.lang ?? Lang.RU;
                const langs = run.config.langs.length ? run.config.langs : [lang];
                const depth = getDepth(relativeTocDir) + 1;

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
                const singlePageDataFn = join(run.output, tocDir, SINGLE_PAGE_DATA_FILENAME);
                const singlePageContent = generateStaticMarkup(
                    pageData,
                    {path: join(relativeTocDir, 'single-page-toc'), content: toc},
                    (toc.title as string) || '',
                );

                await run.write(singlePageFn, singlePageContent);
                await run.write(singlePageDataFn, JSON.stringify(pageData));
            }),
        );
    } catch (error) {
        console.log(error);
    }
}

async function saveRedirectPage(run: Run) {
    const redirectLangRelativePath = `./${run.config.lang}/index.html`;
    const redirectPagePath = join(run.output, 'index.html');
    const redirectLangPath = join(run.output, redirectLangRelativePath);

    if (!existsSync(redirectPagePath) && existsSync(redirectLangPath)) {
        const content = generateStaticRedirect(run.config.lang, redirectLangRelativePath);
        await run.write(redirectPagePath, content);
    }
}

function savePageResultForSinglePage(
    pageProps: DocInnerProps,
    path: RelativePath,
    tocDir: RelativePath,
): void {
    // TODO: allow page-constructor pages?
    if (pageProps.data.leading) {
        return;
    }

    singlePagePaths[tocDir] = singlePagePaths[tocDir] || new Set();

    if (singlePagePaths[tocDir].has(path)) {
        return;
    }

    singlePagePaths[tocDir].add(path);

    singlePageResults[tocDir] = singlePageResults[tocDir] || [];
    singlePageResults[tocDir].push({
        path: path,
        content: pageProps.data.html,
        title: pageProps.data.title,
        // TODO: handle file resources
    });
}

export type ResolverResult = {
    result: string;
    info: DocInnerProps;
};

async function preparingPagesByOutputFormat(run: Run, path: RelativePath): Promise<DocInnerProps> {
    const {outputFormat} = run.config;

    const file = normalizePath(path);
    const resolver = outputFormat === 'html' ? resolveToHtml : resolveToMd;
    const outputPath = outputFormat === 'html' ? path.replace(/\.(md|y?aml)$/i, '.html') : path;

    try {
        const {result, info} = await resolver(run, file);

        await run.write(join(run.output, outputPath), result);

        return info;
    } catch (e) {
        const message = `No such file or has no access to ${bold(join(run.input, path))}`;

        console.log(message, e);
        run.logger.error(message);

        return {};
    }
}
