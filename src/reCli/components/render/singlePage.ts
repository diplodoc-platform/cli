import path from 'node:path';
import {join} from 'path';
import {SinglePageResult} from '~/models';
import {TocIndexMap} from '~/reCli/components/toc/types';
import {BuildConfig} from '~/commands/build';
import {getDepth, joinSinglePageResults} from '~/utils';
import pMap from 'p-map';
import {Lang} from '~/constants';
import {generateStaticMarkup} from '~/reCli/components/render/document';
import {DocInnerProps, DocPageData} from '@diplodoc/client/ssr';
import {CONCURRENCY} from '~/reCli/constants';
import fs from 'node:fs';
import {LogCollector} from '~/reCli/utils/logger';

const SINGLE_PAGE_FILENAME = 'single-page.html';
const SINGLE_PAGE_DATA_FILENAME = 'single-page.json';

export interface SaveSinglePagesProps {
    options: BuildConfig;
    singlePageTocPagesMap: Map<string, SinglePageResult[]>;
    tocIndex: TocIndexMap;
    logger: LogCollector;
}

export async function saveSinglePages({
    options,
    singlePageTocPagesMap,
    tocIndex,
    logger,
}: SaveSinglePagesProps) {
    const {lang: configLang, langs: configLangs, resources} = options;

    try {
        await pMap(
            Array.from(singlePageTocPagesMap.entries()),
            async ([tocPath, pageResults]) => {
                if (!pageResults.length) return;

                const tocDir = path.dirname(tocPath.replace(/\\/g, '/').replace(/^\/?/, ''));
                const singlePageBody = joinSinglePageResults(pageResults, tocDir);

                const tocIdx = tocIndex.get(tocPath);
                if (!tocIdx) {
                    throw new Error(`Toc for ${tocPath} not found`);
                }

                const {toc} = tocIdx;

                const lang = configLang ?? Lang.RU;
                const langs = configLangs?.length ? configLangs : [lang];

                const pageData = {
                    data: {
                        leading: false as const,
                        html: singlePageBody,
                        headings: [],
                        meta: resources || {},
                        title: toc.title || '',
                    },
                    router: {
                        pathname: SINGLE_PAGE_FILENAME,
                        depth: getDepth(tocDir) + 1,
                    },
                    lang,
                    langs,
                };

                // Save the full single page for viewing locally
                const singlePageFn = join(tocPath, SINGLE_PAGE_FILENAME);
                const singlePageDataFn = join(tocPath, SINGLE_PAGE_DATA_FILENAME);
                const tocInfo = {path: join(tocDir, 'single-page-toc'), content: toc};
                const singlePageContent = generateStaticMarkup(
                    options,
                    pageData as unknown as DocInnerProps<DocPageData>,
                    tocInfo,
                    (toc.title as string) || '',
                );

                await Promise.all([
                    fs.promises.writeFile(singlePageFn, singlePageContent),
                    fs.promises.writeFile(singlePageDataFn, JSON.stringify(pageData)),
                ]);
            },
            {concurrency: CONCURRENCY},
        );
    } catch (error) {
        logger.error(`Error saving single pages: ${(error as Error).stack}`);
    }
}
