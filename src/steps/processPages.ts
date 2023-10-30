import {join, relative, resolve} from 'path';
import {writeFileSync} from 'fs';

import {ArgvService, PluginService, TocService} from '../services';
import {generateStaticMarkup, joinSinglePageResults, transformTocForSinglePage} from '../utils';
import {SinglePageResult, YfmToc} from '../models';
import {Lang, SINGLE_PAGE_DATA_FILENAME, SINGLE_PAGE_FILENAME} from '../constants';
import {getChunkSize} from '../utils/workers';
import {getPoolEnv, runPool} from './processPool';
import {chunk} from 'lodash';
import {VCSConnector} from '../vcs-connector/connector-models';
import {asyncify, mapLimit} from 'async';
import {processPage} from '../resolvers/processPage';

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(vcsConnector?: VCSConnector): Promise<void> {
    const navigationPaths = TocService.getNavigationPaths();

    if (process.env.DISABLE_PARALLEL_BUILD) {
        await processPagesFallback(vcsConnector, navigationPaths);
        return;
    }

    const navigationPathsChunks = chunk(navigationPaths, getChunkSize(navigationPaths));

    await Promise.all(
        navigationPathsChunks.map(async (navigationPathsChunk) => {
            await runPool('transform', navigationPathsChunk);
        }),
    );
}

export async function saveSinglePages(
    outputBundlePath: string,
    singlePageResults: Record<string, SinglePageResult[]>,
) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        lang,
        resources,
    } = ArgvService.getConfig();

    try {
        await Promise.all(
            Object.keys(singlePageResults).map(async (tocDir) => {
                if (!singlePageResults[tocDir].length) {
                    return;
                }

                const singlePageBody = joinSinglePageResults(
                    singlePageResults[tocDir],
                    inputFolderPath,
                    tocDir,
                );
                const tocPath = join(relative(inputFolderPath, tocDir), 'toc.yaml');
                const toc: YfmToc | null = TocService.getForPath(tocPath) || null;
                const preparedToc = transformTocForSinglePage(toc, {
                    root: inputFolderPath,
                    currentPath: join(tocDir, SINGLE_PAGE_FILENAME),
                }) as YfmToc;

                const pageData = {
                    data: {
                        leading: false as const,
                        html: singlePageBody,
                        headings: [],
                        meta: resources || {},
                        toc: preparedToc,
                    },
                    router: {
                        pathname: SINGLE_PAGE_FILENAME,
                    },
                    lang: lang || Lang.RU,
                } as unknown as Parameters<typeof generateStaticMarkup>[0];

                const outputTocDir = resolve(outputFolderPath, relative(inputFolderPath, tocDir));
                const relativeOutputBundlePath = relative(outputTocDir, outputBundlePath);

                // Save the full single page for viewing locally
                const singlePageFn = join(tocDir, SINGLE_PAGE_FILENAME);
                const singlePageDataFn = join(tocDir, SINGLE_PAGE_DATA_FILENAME);
                const singlePageContent = generateStaticMarkup(pageData, relativeOutputBundlePath);

                writeFileSync(singlePageFn, singlePageContent);
                writeFileSync(singlePageDataFn, JSON.stringify(pageData));
            }),
        );
    } catch (error) {
        console.log(error);
    }
}

async function processPagesFallback(
    vcsConnector: VCSConnector | undefined,
    navigationPaths: string[],
) {
    PluginService.setPlugins();

    const {singlePageResults} = getPoolEnv();
    const singlePagePaths: Record<string, Set<string>> = {};

    const concurrency = 500;

    await mapLimit(
        navigationPaths,
        concurrency,
        asyncify(async (pathToFile: string) => {
            await processPage({
                pathToFile,
                vcsConnector,
                singlePageResults,
                singlePagePaths,
            });
        }),
    );
}
