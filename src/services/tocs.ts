import {dirname, extname, join, parse, resolve, relative, normalize, sep} from 'path';
import {copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync} from 'fs';
import {load, dump} from 'js-yaml';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import liquid from '@doc-tools/transform/lib/liquid';
import log from '@doc-tools/transform/lib/log';
import {bold} from 'chalk';

import {ArgvService, PresetService} from './index';
import {getContentWithUpdatedStaticMetadata} from './metadata';
import {YfmToc, IncluderFnOutputElement} from '../models';
import {Stage, IncludeMode} from '../constants';
import {isExternalHref, logger} from '../utils';
import {filterFiles, firstFilterTextItems, liquidField} from './utils';
import {getIncluder, isValidIncluder} from './includers';

export interface TocServiceData {
    storage: Map<string, YfmToc>;
    navigationPaths: string[];
    includedTocPaths: Set<string>;
}

const storage: TocServiceData['storage'] = new Map();
let navigationPaths: TocServiceData['navigationPaths'] = [];
const includedTocPaths: TocServiceData['includedTocPaths'] = new Set();

async function add(path: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        ignoreStage,
        vars,
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

    if (parsedToc.title) {
        parsedToc.title = firstFilterTextItems(
            parsedToc.title,
            combinedVars,
            {resolveConditions: true},
        );
    }

    if (typeof parsedToc.title === 'string') {
        parsedToc.title = liquidField(parsedToc.title, combinedVars, path);
    }

    parsedToc.items = await processTocItems(
        path,
        parsedToc.items,
        join(inputFolderPath, pathToDir),
        resolve(inputFolderPath),
        combinedVars,
    );

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
    }

    prepareNavigationPaths(parsedToc, pathToDir);
}

async function processTocItems(path: string, items: YfmToc[], tocDir: string, sourcesDir: string, vars: Record<string, string>) {
    const {
        resolveConditions,
        removeHiddenTocItems,
    } = ArgvService.getConfig();

    /* Should remove all links with false expressions */
    if (resolveConditions || removeHiddenTocItems) {
        try {
            items = filterFiles(items, 'items', vars, {
                resolveConditions,
                removeHiddenTocItems,
            });
        } catch (error) {
            log.error(`Error while filtering toc file: ${path}. Error message: ${error}`);
        }
    }

    /* Should resolve all includes */
    return _replaceIncludes(path, items, tocDir, sourcesDir, vars);
}

function getForPath(path: string): YfmToc|undefined {
    return storage.get(path);
}

function getNavigationPaths(): string[] {
    return [...navigationPaths];
}

function getIncludedTocPaths(): string[] {
    return [...includedTocPaths];
}

function prepareNavigationPaths(parsedToc: YfmToc, dirPath: string) {
    function processItems(items: YfmToc[], pathToDir: string) {
        items.forEach((item) => {
            if (!parsedToc.singlePage && item.items) {
                const preparedSubItems = item.items.map(((yfmToc: YfmToc, index: number) => {
                    // Generate personal id for each navigation item
                    yfmToc.id = `${yfmToc.name}-${index}-${Math.random()}`;
                    return yfmToc;
                }));
                processItems(preparedSubItems, pathToDir);
            }

            if (item.href && !isExternalHref(item.href)) {
                const href = join(pathToDir, item.href);
                storage.set(href, parsedToc);

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
 * Copies all files of include toc to original dir.
 * @param tocPath
 * @param destDir
 * @return
 * @private
 */
function _copyTocDir(tocPath: string, destDir: string) {
    const {input: inputFolderPath} = ArgvService.getConfig();

    const {dir: tocDir} = parse(tocPath);
    const files: string[] = walkSync(tocDir, {
        globs: ['**/*.*'],
        ignore: ['**/toc.yaml'],
        directories: false,
    });

    files.forEach((relPath) => {
        const from = resolve(tocDir, relPath);
        const to = resolve(destDir, relPath);
        const fileExtension = extname(relPath);
        const isMdFile = fileExtension === '.md';

        shell.mkdir('-p', parse(to).dir);

        if (isMdFile) {
            const fileContent = readFileSync(from, 'utf8');
            const sourcePath = relative(inputFolderPath, from);
            const updatedFileContent = getContentWithUpdatedStaticMetadata({
                fileContent,
                sourcePath,
                addSourcePath: true,
            });

            writeFileSync(to, updatedFileContent);
        } else {
            copyFileSync(from, to);
        }
    });
}

async function applyIncluder(path: string, item: YfmToc): Promise<void> {
    const {input: inputFolderPath, rootInput} = ArgvService.getConfig();

    const root = join(rootInput, dirname(path));

    const outputPath = join(inputFolderPath, dirname(path));

    // eslint-disable-next-line no-shadow
    const postprocess = ({content, path}: IncluderFnOutputElement) => ({
        content: content && typeof content === 'object' ? dump(content) : content,
        path: path.replace(root, outputPath),
    });

    try {
        if (!item?.include) { return; }

        if (!item?.include?.mode) {
            item.include.mode = IncludeMode.LINK;
        }

        if (item.include.mode !== IncludeMode.LINK) {
            throw new Error('include with the includer supports only link mode, set include mode to link');
        }

        if (!isValidIncluder(item.include)) {
            throw new Error(`includer: ${item.include.includer} not implemented`);
        }

        const params = {include: item.include, name: item.name, root};

        const {generateTocs, generateLeadingPages, generateContent, generatePath} = getIncluder(item.include);

        const [tocs, pages, contents] = await Promise.all([
            generateTocs ? generateTocs(params) : Promise.resolve([]),
            generateLeadingPages ? generateLeadingPages(params) : Promise.resolve([]),
            generateContent ? generateContent(params) : Promise.resolve([]),
        ]);

        [...tocs, ...pages, ...contents]
            .map(postprocess)
            // eslint-disable-next-line no-shadow
            .forEach(({content, path}: {content: string; path: string}) => {
                mkdirSync(dirname(path), {recursive: true});

                writeFileSync(path, content);
            });

        item.include.path = await generatePath(params);
    } catch (e) {
        logger.error(resolve(rootInput, path), e.message);

        process.exit(1);
    }
}

/**
 * Make hrefs relative to the main toc in the included toc.
 * @param items
 * @param includeTocDir
 * @param tocDir
 * @return
 * @private
 */
function _replaceIncludesHrefs(items: YfmToc[], includeTocDir: string, tocDir: string): YfmToc[] {
    return items.reduce((acc, tocItem) => {
        if (tocItem.href) {
            tocItem.href = relative(tocDir, resolve(includeTocDir, tocItem.href));
        }

        if (tocItem.items) {
            tocItem.items = _replaceIncludesHrefs(tocItem.items, includeTocDir, tocDir);
        }

        if (tocItem.include) {
            const {path} = tocItem.include;
            tocItem.include.path = relative(tocDir, resolve(includeTocDir, path));
        }

        return acc.concat(tocItem);
    }, [] as YfmToc[]);
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

function addIncludeTocPath(includeTocPath: string) {
    includedTocPaths.add(includeTocPath);
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
async function _replaceIncludes(path: string, items: YfmToc[], tocDir: string, sourcesDir: string, vars: Record<string, string>): Promise<YfmToc[]> {
    const result: YfmToc[] = [];

    for (const item of items) {
        let includedInlineItems: YfmToc[] | null = null;

        if (item.name) {
            const tocPath = join(tocDir, 'toc.yaml');

            item.name = _liquidSubstitutions(item.name, vars, tocPath);
        }

        if (item.include && item.include.includer) {
            await applyIncluder(path, item);
        }

        if (item.include) {
            const {mode = IncludeMode.ROOT_MERGE} = item.include;
            const includeTocPath = mode === IncludeMode.ROOT_MERGE
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
                includedTocItems = await processTocItems(path, includedTocItems, baseTocDir, sourcesDir, vars);

                /* Make hrefs relative to the main toc */
                if (mode === IncludeMode.LINK) {
                    includedTocItems = _replaceIncludesHrefs(includedTocItems, includeTocDir, tocDir);
                }

                if (item.name) {
                    item.items = includedTocItems;
                } else {
                    includedInlineItems = includedTocItems;
                }
            } catch (err) {
                const message = (
                    `Error while including toc: ${bold(includeTocPath)} to ${bold(join(tocDir, 'toc.yaml'))}`
                );

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
    const {input: inputFolderPath} = ArgvService.getConfig();

    const tocDir = dirname(pagePath);
    const tocPath = resolve(tocDir, 'toc.yaml');


    if (!tocDir.includes(inputFolderPath)) {
        throw new Error('Error while finding toc dir');
    }

    if (existsSync(tocPath)) {
        return tocDir;
    }

    return getTocDir(tocDir);
}

function setNavigationPaths(paths: TocServiceData['navigationPaths']) {
    navigationPaths = paths;
}

export default {
    add,
    getForPath,
    getNavigationPaths,
    getTocDir,
    getIncludedTocPaths,
    setNavigationPaths,
};
