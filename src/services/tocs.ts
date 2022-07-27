import {dirname, extname, join, parse, resolve, relative, sep} from 'path';
import {copyFileSync, readdirSync, readFileSync, writeFileSync, existsSync} from 'fs';
import {load, dump} from 'js-yaml';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import liquid from '@doc-tools/transform/lib/liquid';
import log from '@doc-tools/transform/lib/log';
import {getSinglePageAnchorId} from '@doc-tools/transform/lib/utilsFS';
import {bold} from 'chalk';

import {ArgvService, PresetService} from './index';
import {getContentWithUpdatedStaticMetadata} from './metadata';
import {YfmToc, Includer, YfmTocInclude, IncluderFnParams, IncluderFnOutput} from '../models';
import {Stage, SINGLE_PAGE_FOLDER, IncludeMode} from '../constants';
import {isExternalHref} from '../utils';
import {filterFiles, firstFilterTextItems} from './utils';
import {cloneDeep as _cloneDeep} from 'lodash';

export interface TocServiceData {
    storage: Map<string, YfmToc>;
    navigationPaths: string[];
    singlePageNavigationPaths: Set<string>;
    includedTocPaths: Set<string>;
}

const storage: TocServiceData['storage'] = new Map();
let navigationPaths: TocServiceData['navigationPaths'] = [];
const singlePageNavigationPaths: TocServiceData['singlePageNavigationPaths'] = new Set();
const includedTocPaths: TocServiceData['includedTocPaths'] = new Set();

function includers(custom: Includer[]) {
    type IncludersMap = {[key: string]: Includer};

    const includersMap: IncludersMap = {};

    for (const includer of custom) { includersMap[includer.name] = includer; }

    console.log('includers:', JSON.stringify(includersMap, null, 4));

    const hasValidIncluder = (include: YfmTocInclude) =>
        include?.path?.length && include?.includer && includersMap[include.includer as keyof typeof includersMap];

    const getIncluder = (include: YfmTocInclude) => {
        if (hasValidIncluder(include)) { return includersMap[include.includer as keyof typeof includersMap]; }

        throw new Error('includer not implemented');
    };

    return {hasValidIncluder, getIncluder};
}

function generateTocs(params: IncluderFnParams): IncluderFnOutput {
    console.log('gen tocs params:', params);
    const {
        include: {path, mode},
        name,
        root,
    } = params;

    if (mode !== 'link') {
        throw new Error('include with the includer supports only link mode, set mode: link');
    }

    return generateTocsRec(join(root, path), path, name);
}

function generateTocsRec(depth: string, current: string, name: string): IncluderFnOutput {
    console.log('gen tocs rec params:', depth, current, name);

    const contentFilter = ({name}: {name: string}) => /.md$/gmu.test(name) && !/^\./gmu.test(name);
    const dirItem = ({name}: {name: string}) => ({
        name,
        include: {
            path: name + sep + 'toc.yaml',
            mode: 'link',
        },
    });
    const fileItem = ({name}: {name: string}) => ({
        name: name.replace(/.md$/gmu, ''),
        href: name,
    });

    const dirItems = getDirs(resolve(depth)).map(dirItem);
    const fileItems = getFiles(resolve(depth)).filter(contentFilter).map(fileItem);

    const toc = {
        name,
        href: 'index.yaml',
        items: [...dirItems, ...fileItems] as YfmToc[],
    };

    const recurse = dirItems.map(({name}) => generateTocsRec(join(depth, name), name, name));

    return [{content: toc, path: join(depth, 'toc.yaml')}, ...recurse.flat(1)];
}

function generateLeadingPages(
    params: IncluderFnParams,
): IncluderFnOutput {
    console.log('generate lps params:', params);
    const {
        include: {path, mode},
        name,
        root,
    } = params;

    if (mode !== 'link') {
        throw new Error('include with the includer supports only link mode, set mode: link');
    }

    return generateLeadingPagesRec(join(root, path), path, name);
}

function generateLeadingPagesRec(
    depth: string,
    current: string,
    name: string,
): IncluderFnOutput {
    console.log('gen lps rec params:', depth, current, name);

    const contentFilter = ({name}: {name: string}) => /.md$/gmu.test(name) && !/^\./gmu.test(name);
    const dirLink = ({name}: {name: string}) => ({
        title: name,
        href: name + sep,
    });
    const fileLink = ({name}: {name: string}) => ({
        title: name.replace(/.md$/gmu, ''),
        href: name,
    });

    const dirLinks = getDirs(resolve(depth)).map(dirLink);
    const fileLinks = getFiles(resolve(depth)).filter(contentFilter).map(fileLink);

    const index = {
        title: name,
        links: [...dirLinks, ...fileLinks],
    };

    const recurse = dirLinks.map(({title}) => generateTocsRec(join(depth, title), title, title));

    return [{content: index, path: join(depth, 'index.yaml')}, ...recurse.flat(1)];

}

function getDirs(path: string) {
    return readdirSync(path, {withFileTypes: true}).filter((i) => i.isDirectory());
}

function getFiles(path: string) {
    return readdirSync(path, {withFileTypes: true}).filter((i) => i.isFile());
}


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
        removeHiddenTocItems,
        rootInput,
    } = ArgvService.getConfig();

    console.log(JSON.stringify(ArgvService.getConfig()));

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

    /* Should make substitutions in title */
    if (applyPresets && typeof parsedToc.title === 'string') {
        parsedToc.title = _liquidSubstitutions(parsedToc.title, combinedVars, path);
    }

    console.log('parsed toc before:', JSON.stringify(parsedToc, null, 4));

    const {hasValidIncluder, getIncluder} = includers([{
        name: 'sourcedocs',
        generateTocs,
        generateLeadingPages,
    }]);

    for (const item of parsedToc.items) {
        if (!item?.include || !hasValidIncluder(item.include)) { continue; }

        const output: IncluderFnOutput = [];

        const includer = getIncluder(item.include);

        console.log('includer:', includer);

        const params = {include: item.include, root: rootInput, name: item.name};

        if (includer.generateTocs) { output.push(...includer.generateTocs(params)); }
        if (includer.generateLeadingPages) { output.push(...includer.generateLeadingPages(params)); }

        // console.log('output:', JSON.stringify(output, null, 4));

        // write files

        console.log('root:', rootInput, 'inputFolderPath:', inputFolderPath);

        const resolved = output.map(({path, content}) => ({
            path: path.replace(rootInput, inputFolderPath), content,
        }));

        console.log('temp output:', JSON.stringify(resolved, null, 4));

        for (const {content, path} of resolved) {
            writeFileSync(path, dump(content));
        }

        item.include.path = join(item.include.path, 'toc.yaml');
    }

    console.log('parsed toc after:', JSON.stringify(parsedToc, null, 4));

    /* Should resolve all includes */
    parsedToc.items = _replaceIncludes(
        parsedToc.items,
        join(inputFolderPath, pathToDir),
        resolve(inputFolderPath),
        combinedVars,
    );

    /* Should remove all links with false expressions */
    if (resolveConditions || removeHiddenTocItems) {
        try {
            parsedToc.items = filterFiles(parsedToc.items, 'items', combinedVars, {
                resolveConditions,
                removeHiddenTocItems,
            });
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
            parsedSinglePageToc.items = filterFiles(parsedSinglePageToc.items, 'items', {}, {
                removeHiddenTocItems: true,
            });

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

function getSinglePageNavigationPaths(): Set<string> {
    return new Set(singlePageNavigationPaths);
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
                const href = `${pathToDir}/${item.href}`;
                storage.set(href, parsedToc);

                const navigationPath = _normalizeHref(href);
                navigationPaths.push(navigationPath);

                const isYamlFileExtension = extname(item.href) === '.yaml';
                if (!item.hidden && !isYamlFileExtension) {
                    singlePageNavigationPaths.add(navigationPath);
                }
            }
        });
    }

    processItems([parsedToc], dirPath);
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
    parsedToc.href = 'index.md';
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
            const fileData = {sourcePath};
            const updatedFileContent = getContentWithUpdatedStaticMetadata(fileContent, {
                fileData,
                addSourcePath: true,
            });

            writeFileSync(to, updatedFileContent);
        } else {
            copyFileSync(from, to);
        }
    });
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

/**
 * Replaces include fields in toc file by resolved toc.
 * @param items
 * @param tocDir
 * @param sourcesDir
 * @param vars
 * @return
 * @private
 */
function _replaceIncludes(items: YfmToc[], tocDir: string, sourcesDir: string, vars: Record<string, string>): YfmToc[] {
    return items.reduce((acc, item) => {
        let includedInlineItems: YfmToc[] | null = null;

        if (item.name) {
            const tocPath = join(tocDir, 'toc.yaml');

            item.name = _liquidSubstitutions(item.name, vars, tocPath);
        }

        if (item.include) {
            const {path, mode = IncludeMode.ROOT_MERGE} = item.include;
            const includeTocPath = mode === IncludeMode.ROOT_MERGE
                ? resolve(sourcesDir, path)
                : resolve(tocDir, path);
            const includeTocDir = dirname(includeTocPath);

            try {
                const includeToc = load(readFileSync(includeTocPath, 'utf8')) as YfmToc;

                // Should ignore included toc with tech-preview stage.
                if (includeToc.stage === Stage.TECH_PREVIEW) {
                    return acc;
                }

                if (mode === IncludeMode.MERGE || mode === IncludeMode.ROOT_MERGE) {
                    _copyTocDir(includeTocPath, tocDir);
                }
                /* Save the path to exclude toc from the output directory in the next step */
                includedTocPaths.add(includeTocPath);

                let includedTocItems = (item.items || []).concat(includeToc.items);

                /* Resolve nested toc inclusions */
                const baseTocDir = mode === IncludeMode.LINK ? includeTocDir : tocDir;
                includedTocItems = _replaceIncludes(includedTocItems, baseTocDir, sourcesDir, vars);

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
                const message = `Error while including toc: ${bold(includeTocPath)} to ${bold(join(tocDir, 'toc.yaml'))}`;
                console.log(message, err);
                log.error(message);
                return acc;
            } finally {
                delete item.include;
            }
        } else if (item.items) {
            item.items = _replaceIncludes(item.items, tocDir, sourcesDir, vars);
        }

        if (includedInlineItems) {
            return acc.concat(includedInlineItems);
        } else {
            return acc.concat(item);
        }
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

function setNavigationPaths(paths: TocServiceData['navigationPaths']) {
    navigationPaths = paths;
}

export default {
    add,
    getForPath,
    getNavigationPaths,
    getSinglePageNavigationPaths,
    getTocDir,
    getIncludedTocPaths,
    setNavigationPaths,
};
