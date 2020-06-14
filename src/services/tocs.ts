import {dirname, join, parse, resolve} from 'path';
import {copyFileSync, readFileSync, writeFileSync} from 'fs';
import {safeLoad, safeDump} from 'js-yaml';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import evalExp from 'yfm-transform/lib/liquid/evaluation';
import liquid from 'yfm-transform/lib/liquid';
import log from 'yfm-transform/lib/log';
import {bold} from 'chalk';

import {ArgvService, PresetService} from './index';
import {YfmToc} from '../models';
import {Stage} from '../constants';

const storage: Map<string, YfmToc> = new Map();
const navigationPaths: string[] = [];

function add(path: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        ignoreStage,
    } = ArgvService.getConfig();

    const pathToDir: string = dirname(path);
    const content = readFileSync(resolve(inputFolderPath, path), 'utf8');
    const parsedToc: YfmToc = safeLoad(content);

    // Should ignore toc with specified stage.
    if (parsedToc.stage === ignoreStage) {
        return;
    }

    const {vars, input} = ArgvService.getConfig();
    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should make substitutions in title */
    if (parsedToc.title) {
        parsedToc.title = _liquidSubstitutions(parsedToc.title, combinedVars, path);
    }

    /* Should resolve all includes */
    parsedToc.items = _replaceIncludes(parsedToc.items, join(input, pathToDir), resolve(input), combinedVars);

    /* Should remove all links with false expressions */
    parsedToc.items = _filterToc(parsedToc.items, combinedVars);

    if (outputFormat === 'md') {
        /* Should copy resolved and filtered toc to output folder */
        const outputPath = resolve(outputFolderPath, path);
        const outputToc = safeDump(parsedToc);
        shell.mkdir('-p', dirname(outputPath));
        writeFileSync(outputPath, outputToc);
    }

    /* Store parsed toc for .md output format */
    storage.set(path, parsedToc);

    /* Store path to toc file to handle relative paths in navigation */
    parsedToc.base = pathToDir;

    const navigationItemQueue = [parsedToc];

    while (navigationItemQueue.length) {
        const navigationItem = navigationItemQueue.shift();

        if (!navigationItem) {
            continue;
        }

        if (navigationItem.items) {
            const items = navigationItem.items.map(((item: YfmToc, index: number) => {
                // Generate personal id for each navigation item
                item.id = `${item.name}-${index}-${Math.random()}`;
                return item;
            }));
            navigationItemQueue.push(...items);
        }

        if (navigationItem.href) {
            const href = `${pathToDir}/${navigationItem.href}`;
            storage.set(href, parsedToc);

            const navigationPath = _normalizeHref(href);
            navigationPaths.push(navigationPath);
        }
    }
}

function getForPath(path: string): YfmToc|undefined {
    return storage.get(path);
}

function getNavigationPaths(): string[] {
    return [...navigationPaths];
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
 * Filters tocs by expression and removes empty toc' items.
 * @param items
 * @param vars
 * @return {YfmToc}
 * @private
 */
function _filterToc(items: YfmToc[], vars: Record<string, string>) {
    return items
        .filter(({when}) => (
            when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars))
        ))
        .filter((el) => {
            if (el.items) {
                el.items = _filterToc(el.items, vars);
            }
            // If toc has no items, don't include it into navigation tree.
            return !(Array.isArray(el.items) && el.items.length === 0);
        });
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
                const includeToc: YfmToc = safeLoad(readFileSync(includeTocPath, 'utf8'));

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

export default {
    add,
    getForPath,
    getNavigationPaths,
};
