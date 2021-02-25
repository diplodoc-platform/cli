import {dirname, join, parse, resolve} from 'path';
import {copyFileSync, readFileSync, writeFileSync, existsSync} from 'fs';
import {load, dump} from 'js-yaml';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import liquid from '@doc-tools/transform/lib/liquid';
import log from '@doc-tools/transform/lib/log';
import {getSinglePageAnchorId} from '@doc-tools/transform/lib/utils';
import {bold} from 'chalk';

import {ArgvService, PresetService} from './index';
import {YfmToc} from '../models';
import {Stage, SINGLE_PAGE_FOLDER} from '../constants';
import {isExternalHref} from '../utils';
import {filterFiles} from './utils';
import {cloneDeep as _cloneDeep} from 'lodash';

const storage: Map<string, YfmToc> = new Map();
const navigationPaths: string[] = [];

function add(path: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        ignoreStage,
        singlePage,
        vars,
        resolveConditions,
        applyPresets,
    } = ArgvService.getConfig();

    const pathToDir = dirname(path);
    const content = readFileSync(resolve(inputFolderPath, path), 'utf8');
    const parsedToc = load(content) as YfmToc;

    // Should ignore toc with specified stage.
    if (parsedToc.stage === ignoreStage) {
        return;
    }

    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should make substitutions in title */
    if (applyPresets && parsedToc.title) {
        parsedToc.title = _liquidSubstitutions(parsedToc.title, combinedVars, path);
    }

    /* Should resolve all includes */
    parsedToc.items = _replaceIncludes(
        parsedToc.items,
        join(inputFolderPath, pathToDir),
        resolve(inputFolderPath),
        combinedVars,
    );

    /* Should remove all links with false expressions */
    if (resolveConditions) {
        try {
            parsedToc.items = filterFiles(parsedToc.items, 'items', combinedVars);
        } catch (error) {
            log.error(`Error while filtering toc file: ${path}. Error message: ${error}`);
        }
    }

    /* Store parsed toc for .md output format */
    storage.set(path, parsedToc);

    /* Store path to toc file to handle relative paths in navigation */
    parsedToc.base = pathToDir;

    if (outputFormat === 'md') {
        /* Should copy resolved and filtered toc to output folder */
        const outputPath = resolve(outputFolderPath, path);
        const outputToc = dump(parsedToc);
        shell.mkdir('-p', dirname(outputPath));
        writeFileSync(outputPath, outputToc);

        if (singlePage) {
            const parsedSinglePageToc = _cloneDeep(parsedToc);
            const currentPath = resolve(outputFolderPath, path);
            prepareTocForSinglePageMode(parsedSinglePageToc, {root: outputFolderPath, currentPath});

            const outputSinglePageDir = resolve(dirname(outputPath), SINGLE_PAGE_FOLDER);
            const outputSinglePageTocPath = resolve(outputSinglePageDir, 'toc.yaml');
            const outputSinglePageToc = dump(parsedSinglePageToc);

            shell.mkdir('-p', outputSinglePageDir);
            writeFileSync(outputSinglePageTocPath, outputSinglePageToc);
        }
    }

    prepareNavigationPaths(parsedToc, pathToDir);
}

function getForPath(path: string): YfmToc|undefined {
    return storage.get(path);
}

function getNavigationPaths(): string[] {
    return [...navigationPaths];
}

function prepareNavigationPaths(parsedToc: YfmToc, pathToDir: string) {
    function processItems(items: YfmToc[], pathToDir: string) {
        items.forEach((item) => {
            if (!parsedToc.singlePage && item.items) {
                const preparedSubItems = item.items.map(((item: YfmToc, index: number) => {
                    // Generate personal id for each navigation item
                    item.id = `${item.name}-${index}-${Math.random()}`;
                    return item;
                }));
                processItems(preparedSubItems, pathToDir);
            }

            if (item.href && !isExternalHref(item.href)) {
                const href = `${pathToDir}/${item.href}`;
                storage.set(href, parsedToc);

                const navigationPath = _normalizeHref(href);
                navigationPaths.push(navigationPath);
            }
        });
    }

    processItems([parsedToc], pathToDir);
}

function prepareTocForSinglePageMode(parsedToc: YfmToc, options: {root: string; currentPath: string}) {
    const {root, currentPath} = options;

    function processItems(items: YfmToc[]) {
        items.forEach((item) => {
            if (item.items) {
                processItems(item.items);
            }

            if (item.href && !isExternalHref(item.href)) {
                item.href = getSinglePageAnchorId({root, currentPath, pathname: item.href});
            }
        });
    }

    processItems(parsedToc.items);
    parsedToc.singlePage = true;
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
    if (href.endsWith('.md') || href.endsWith('.yaml')) {
        return href;
    }

    if (href.endsWith('/')) {
        return `${href}index.yaml`;
    }

    return `${href}.md`;
}

/**
 * Copies all files of include toc to original dir.
 * @param tocPath
 * @param destDir
 * @return
 * @private
 */
function _copyTocDir(tocPath: string, destDir: string) {
    const {dir: tocDir} = parse(tocPath);
    const files: string[] = walkSync(tocDir, {
        globs: ['**/*.*'],
        ignore: ['**/toc.yaml'],
    });

    files.forEach((relPath) => {
        const from = resolve(tocDir, relPath);
        const to = resolve(destDir, relPath);

        shell.mkdir('-p', parse(to).dir);
        copyFileSync(from, to);
    });
}

/**
 * Liquid substitutions in toc file.
 * @param input
 * @param vars
 * @param path
 * @return {string}
 * @private
 */
function _liquidSubstitutions(input: string, vars: Record<string, string>, path: string) {
    const {outputFormat, applyPresets} = ArgvService.getConfig();
    if (outputFormat === 'md' && !applyPresets) {
        return input;
    }

    return liquid(input, vars, path, {
        conditions: false,
        substitutions: true,
    });
}

/**
 * Replaces include fields in toc file by resolved toc.
 * @param items
 * @param tocDir
 * @param sourcesDir
 * @param vars
 * @return
 * @private
 */
function _replaceIncludes(items: YfmToc[], tocDir: string, sourcesDir: string, vars: Record<string, string>) {
    return items.reduce((acc, item) => {
        if (item.name) {
            const tocPath = join(tocDir, 'toc.yaml');

            item.name = _liquidSubstitutions(item.name, vars, tocPath);
        }

        if (item.include) {
            const {path} = item.include;
            const includeTocPath = resolve(sourcesDir, path);

            try {
                const includeToc = load(readFileSync(includeTocPath, 'utf8')) as YfmToc;

                // Should ignore included toc with tech-preview stage.
                if (includeToc.stage === Stage.TECH_PREVIEW) {
                    return acc;
                }

                _copyTocDir(includeTocPath, tocDir);
                item.items = (item.items || []).concat(includeToc.items);
            } catch (err) {
                log.error(`Error while including toc: ${bold(includeTocPath)} to ${bold(join(tocDir, 'toc.yaml'))}`);
                return acc;
            } finally {
                delete item.include;
            }
        }

        if (item.items) {
            item.items = _replaceIncludes(item.items, tocDir, sourcesDir, vars);
        }

        return acc.concat(item);
    }, [] as YfmToc[]);
}

function getTocDir(pagePath: string): string {
    const {output: outputFolderPath} = ArgvService.getConfig();

    const tocDir = dirname(pagePath);
    const tocPath = resolve(tocDir, 'toc.yaml');


    if (!tocDir.includes(outputFolderPath)) {
        throw new Error('Error while finding toc dir');
    }

    if (existsSync(tocPath)) {
        return tocDir;
    }

    return getTocDir(tocDir);
}

export default {
    add,
    getForPath,
    getNavigationPaths,
    getTocDir,
};
