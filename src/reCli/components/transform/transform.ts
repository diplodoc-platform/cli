import {FileMetaMap} from '../../types';
import path from 'node:path';
import * as fs from 'node:fs';
import yaml from 'js-yaml';
import {BuildConfig, Run} from '~/commands/build';
import {PresetIndex} from '~/reCli/components/presets/types';
import GithubConnector from '../vcs/github';
import {TocIndexMap} from '~/reCli/components/toc/types';
import {LeadingPage, SinglePageResult} from '~/models';
import {cachedMkdir} from '~/reCli/utils';
import {getPageToc} from '~/reCli/components/toc/utils';
import {DocInnerProps} from '@diplodoc/client/ssr';
import {mdPageToMd} from '~/reCli/components/transform/mdPageToMd';
import {transformYaml} from '~/reCli/components/transform/transformYaml';
import {pageToHtml} from '~/reCli/components/transform/pageToHtml';
import {LogCollector} from '~/reCli/utils/logger';
import {legacyConfig as legacyConfigFn} from '~/commands/build/legacy-config';

/*eslint-disable no-console*/

export interface TransformPageProps {
    run: Run;
    options: BuildConfig;
    cwd: string;
    targetCwd: string;
    presetIndex: PresetIndex;
    fileMetaMap: FileMetaMap;
    writeConflicts: Map<string, string>;
    vcsConnector?: GithubConnector;
    tocIndex: TocIndexMap;
    logger: LogCollector;
    singlePageTocPagesMap: null | Map<string, SinglePageResult[]>;
    indexPage: (page: string, props: DocInnerProps) => void;
}

export async function transformPage(props: TransformPageProps, pagePath: string) {
    const {targetCwd, cwd, singlePageTocPagesMap, tocIndex, run, indexPage} = props;
    const legacyConfig = legacyConfigFn(run);
    const {resolveConditions, outputFormat, allowCustomResources, resources, singlePage, search} =
        legacyConfig;
    const ext = path.extname(pagePath);

    switch (outputFormat) {
        case 'md': {
            switch (ext) {
                case '.md': {
                    await mdPageToMd(props, pagePath);
                    break;
                }
                case '.yaml': {
                    let page = yaml.load(
                        await fs.promises.readFile(
                            path.join(cwd, pagePath) as AbsolutePath,
                            'utf8',
                        ),
                    ) as LeadingPage;

                    if (resolveConditions && path.basename(pagePath) === 'index.yaml') {
                        page = transformYaml(page, props, pagePath);
                    }

                    if (allowCustomResources && resources) {
                        page.meta = {...page.meta, ...resources};
                    }

                    const targetPath = path.join(targetCwd, pagePath);
                    await cachedMkdir(path.dirname(targetPath));
                    await fs.promises.writeFile(targetPath, yaml.dump(page));
                    break;
                }
            }
            break;
        }
        case 'html': {
            switch (ext) {
                case '.md':
                case '.yaml': {
                    const pageProps = await pageToHtml(props, pagePath);

                    if (search) {
                        indexPage(pagePath, pageProps);
                    }

                    if (singlePageTocPagesMap && singlePage) {
                        savePageResultForSinglePage({
                            singlePageTocPagesMap,
                            pagePath,
                            pageProps,
                            tocIndex,
                        });
                    }
                    break;
                }
                default: {
                    const sourcePath = path.join(cwd, pagePath);
                    const targetPath = path.join(targetCwd, pagePath);
                    await cachedMkdir(path.dirname(targetPath));
                    await fs.promises.cp(sourcePath, targetPath);
                }
            }
            break;
        }
    }
}

const singlePagePaths = new Map<string, Set<string>>();

interface SavePageResultForSinglePageProps {
    singlePageTocPagesMap: Map<string, SinglePageResult[]>;
    pagePath: string;
    pageProps: DocInnerProps;
    tocIndex: TocIndexMap;
}

function savePageResultForSinglePage({
    singlePageTocPagesMap,
    pageProps,
    pagePath,
    tocIndex,
}: SavePageResultForSinglePageProps) {
    // TODO: allow page-constructor pages?
    if (pageProps.data.leading) {
        return;
    }

    if (!('html' in pageProps.data)) {
        return;
    }

    const {tocPath} = getPageToc(tocIndex, pagePath);
    if (!tocPath) {
        throw new Error('Toc path not found');
    }

    let paths = singlePagePaths.get(tocPath);
    if (!paths) {
        paths = new Set();
        singlePagePaths.set(tocPath, paths);
    }

    if (paths.has(pagePath)) {
        return;
    }

    paths.add(pagePath);

    let pages = singlePageTocPagesMap.get(tocPath);
    if (!pages) {
        pages = [];
        singlePageTocPagesMap.set(tocPath, pages);
    }
    pages.push({
        path: pagePath,
        content: pageProps.data.html,
        title: pageProps.data.title,
    });
}
