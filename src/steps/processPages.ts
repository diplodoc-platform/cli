import type {DocInnerProps} from '@diplodoc/client';
import type {Run} from '~/commands/build';
import {join} from 'node:path';
import {existsSync} from 'fs';
import log from '@diplodoc/transform/lib/log';
import {asyncify, mapLimit} from 'async';
import {bold} from 'chalk';
import {dump, load} from 'js-yaml';

import {
    Lang,
    PAGE_PROCESS_CONCURRENCY,
    SINGLE_PAGE_DATA_FILENAME,
    SINGLE_PAGE_FILENAME,
} from '../constants';
import {LeadingPage, SinglePageResult, YfmToc} from '../models';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {LeadingService, PluginService, SearchService} from '../services';
import {generateStaticMarkup} from '~/pages/document';
import {generateStaticRedirect} from '~/pages/redirect';
import {getDepth, joinSinglePageResults} from '../utils';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(run: Run): Promise<void> {
    PluginService.setPlugins();

    await mapLimit(
        run.toc.entries,
        PAGE_PROCESS_CONCURRENCY,
        asyncify(async (pathToFile: NormalizedPath) => {
            run.logger.proc(pathToFile);

            await preparingPagesByOutputFormat(
                run,
                pathToFile,
                run.config.template.features.conditions,
                run.config.singlePage,
            );
        }),
    );

    if (run.config.singlePage) {
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

                const toc = run.toc.for(join(relativeTocDir, 'toc.yaml'))[1] as YfmToc;
                const lang = run.config.lang ?? Lang.RU;
                const langs = run.config.langs.length ? run.config.langs : [lang];

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
                        depth: getDepth(relativeTocDir) + 1,
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

async function preparingPagesByOutputFormat(
    run: Run,
    path: RelativePath,
    resolveConditions: boolean,
    singlePage: boolean,
): Promise<void> {
    const {outputFormat, allowCustomResources} = run.config;

    try {
        const isYaml = isYamlFile(path);
        const isMd = isMdFile(path);
        const isLeading = isLeadingFile(path);

        if (resolveConditions && isLeading) {
            LeadingService.filterFile(path);
        }

        if (outputFormat === 'md' && isYaml && allowCustomResources) {
            await processingYamlFile(run, path);
            return;
        }

        if ((outputFormat === 'md' && isYaml) || (outputFormat === 'html' && !isYaml && !isMd)) {
            await run.copy(join(run.input, path), join(run.output, path));
            return;
        }

        switch (outputFormat) {
            case 'md':
                await resolveMd2Md(run, path);
                return;
            case 'html': {
                const resolvedFileProps = await resolveMd2HTML(run, path);

                SearchService.add(path, resolvedFileProps);

                if (singlePage) {
                    savePageResultForSinglePage(resolvedFileProps, path, run.toc.dir(path));
                }

                return;
            }
        }
    } catch (e) {
        const message = `No such file or has no access to ${bold(join(run.input, path))}`;
        console.log(message, e);
        log.error(message);
    }
}
async function processingYamlFile(run: Run, path: RelativePath) {
    const content = await run.read(join(run.input, path));
    const parsedContent = load(content) as LeadingPage;

    run.meta.add(path, parsedContent.meta);
    run.meta.addResources(path, run.config.resources);

    parsedContent.meta = run.meta.dump(path);

    await run.write(join(run.output, path), dump(parsedContent));
}

function isYamlFile(path: AnyPath) {
    return path.endsWith('.yaml');
}

function isMdFile(path: AnyPath) {
    return path.endsWith('.md');
}

function isLeadingFile(path: AnyPath) {
    return path.endsWith('/index.yaml') || path === 'index.yaml';
}
