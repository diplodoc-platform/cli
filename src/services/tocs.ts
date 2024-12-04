import {dirname, join, normalize, parse, resolve, sep} from 'path';
import {readFileSync} from 'fs';
import {load} from 'js-yaml';
import log from '@diplodoc/transform/lib/log';
import {bold} from 'chalk';

import {ArgvService} from './index';
import {YfmToc} from '../models';
import {IncludeMode, Stage} from '../constants';
import {isExternalHref, logger} from '../utils';
import {IncludersError, applyIncluders} from './includers';
import {addSourcePath} from './metadata';
import type {TocService} from '~/commands/build/core/toc';

export interface TocServiceData {
    navigationPaths: string[];
}

let navigationPaths: TocServiceData['navigationPaths'] = [];
const tocFileCopyMap = new Map<string, string>();

let toc: TocService;
async function init(service: TocService) {
    toc = service;
}

function getForPath(path: string): [string | null, YfmToc | null] {
    return toc.for(path);
}

function getNavigationPaths(): string[] {
    return [...toc.entries];
}

function prepareNavigationPaths(parsedToc: YfmToc, dirPath: string) {
    function processItems(items: YfmToc[], pathToDir: string) {
        items.forEach((item) => {
            if (!parsedToc.singlePage && item.items) {
                const preparedSubItems = item.items.map((yfmToc: YfmToc, index: number) => {
                    // Generate personal id for each navigation item
                    yfmToc.id = `${yfmToc.name}-${index}-${Math.random()}`;
                    return yfmToc;
                });
                processItems(preparedSubItems, pathToDir);
            }

            if (item.href && !isExternalHref(item.href)) {
                const href = join(pathToDir, item.href);

                const navigationPath = _normalizeHref(href);
                navigationPaths.push(navigationPath);
            }
        });
    }

    processItems([parsedToc], dirPath);
}

/**
 * Should normalize hrefs. MD and YAML files will be ignored.
 * @param href
 * @return {string}
 * @example instance-groups/create-with-coi/ -> instance-groups/create-with-coi/index.yaml
 * @example instance-groups/create-with-coi -> instance-groups/create-with-coi.md
 * @private
 */
function _normalizeHref(href: string): string {
    const preparedHref = normalize(href);

    if (preparedHref.endsWith('.md') || preparedHref.endsWith('.yaml')) {
        return preparedHref;
    }

    if (preparedHref.endsWith(sep)) {
        return `${preparedHref}index.yaml`;
    }

    return `${preparedHref}.md`;
}

/**
 * Replaces include fields in toc file by resolved toc.
 * @param path
 * @param items
 * @param tocDir
 * @param sourcesDir
 * @param vars
 * @return
 * @private
 */
async function _replaceIncludes(
    path: string,
    items: YfmToc[],
    tocDir: string,
    sourcesDir: string,
    vars: Record<string, string>,
): Promise<YfmToc[]> {
    const result: YfmToc[] = [];

    for (const item of items) {
        let includedInlineItems: YfmToc[] | null = null;

        if (item.name) {
            const tocPath = join(tocDir, 'toc.yaml');

            item.name = _liquidSubstitutions(item.name, vars, tocPath);
        }

        try {
            await applyIncluders(path, item, vars);
        } catch (err) {
            if (err instanceof Error || err instanceof IncludersError) {
                const message = err.toString();

                const file = err instanceof IncludersError ? err.path : path;

                logger.error(file, message);
            }
        }

        if (item.include) {
            const {mode = IncludeMode.ROOT_MERGE} = item.include;
            const includeTocPath =
                mode === IncludeMode.ROOT_MERGE
                    ? resolve(sourcesDir, item.include.path)
                    : resolve(tocDir, item.include.path);
            const includeTocDir = dirname(includeTocPath);

            try {
                const includeToc = load(readFileSync(includeTocPath, 'utf8')) as YfmToc;

                // Should ignore included toc with tech-preview stage.
                if (includeToc.stage === Stage.TECH_PREVIEW) {
                    continue;
                }

                if (mode === IncludeMode.MERGE || mode === IncludeMode.ROOT_MERGE) {
                    _copyTocDir(includeTocPath, tocDir);
                }

                /* Save the path to exclude toc from the output directory in the next step */
                addIncludeTocPath(includeTocPath);

                let includedTocItems = (item.items || []).concat(includeToc.items);

                /* Resolve nested toc inclusions */
                const baseTocDir = mode === IncludeMode.LINK ? includeTocDir : tocDir;
                includedTocItems = await processTocItems(
                    path,
                    includedTocItems,
                    baseTocDir,
                    sourcesDir,
                    vars,
                );

                /* Make hrefs relative to the main toc */
                if (mode === IncludeMode.LINK) {
                    includedTocItems = _replaceIncludesHrefs(
                        includedTocItems,
                        includeTocDir,
                        tocDir,
                    );
                }

                if (item.name) {
                    item.items = includedTocItems;
                } else {
                    includedInlineItems = includedTocItems;
                }
            } catch (err) {
                const message = `Error while including toc: ${bold(includeTocPath)} to ${bold(
                    join(tocDir, 'toc.yaml'),
                )}`;

                log.error(message);

                continue;
            } finally {
                delete item.include;
            }
        } else if (item.items) {
            item.items = await processTocItems(path, item.items, tocDir, sourcesDir, vars);
        }

        if (includedInlineItems) {
            result.push(...includedInlineItems);
        } else {
            result.push(item);
        }
    }

    return result;
}

function getTocDir(pagePath: string): string {
    return toc.for(pagePath)[0];
}

function setNavigationPaths(paths: TocServiceData['navigationPaths']) {
    navigationPaths = paths;
}

function getCopyFileMap() {
    return tocFileCopyMap;
}

export default {
    init,
    getForPath,
    getNavigationPaths,
    getTocDir,
    setNavigationPaths,
    getCopyFileMap,
};
