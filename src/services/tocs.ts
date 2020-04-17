import {dirname, join, parse, resolve} from 'path';
import {copyFileSync, readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';
import shell from 'shelljs';
import walkSync from 'walk-sync';
// @ts-ignore
import evalExp from 'yfm-transform/lib/liquid/evaluation';

import {ArgvService} from './index';
import {YfmToc} from '../models';

const storage: Map<string, Object> = new Map();
const navigationPaths: string[] = [];

function add(path: string, basePath: string = '') {
    const pathToDir: string = dirname(path);
    const content = readFileSync(resolve(basePath, path), 'utf8');
    const parsedToc: YfmToc = safeLoad(content);
    const {vars, input} = ArgvService.getConfig();

    /* Should resolve all includes */
    parsedToc.items = _replaceIncludes(parsedToc.items, join(input, pathToDir), resolve(input));

    /* Should remove all links with false expressions */
    parsedToc.items = _filterToc(parsedToc.items, vars);

    /* Store parsed toc for .md output format */
    storage.set(path, parsedToc);

    /* Store path to toc file to handle relative paths in navigation */
    parsedToc.base = pathToDir;

    const navigationItemQueue = [parsedToc];

    while (navigationItemQueue.length) {
        const navigationItem = navigationItemQueue.shift()!;

        if (navigationItem.items) {
            const items = navigationItem.items.map(((item: any, index: number) => {
                // Generate personal id for each navigation item
                item.id = `${item.name}-${index}-${Math.random()}`;
                return item;
            }));
            navigationItemQueue.push(...items);
        }

        if (navigationItem.href) {
            const href: string = `${pathToDir}/${navigationItem.href}`;
            storage.set(href, parsedToc);

            const navigationPath = _normalizeHref(href);
            navigationPaths.push(navigationPath);
        }
    }
}

function getForPath(path: string): Object|undefined {
    return storage.get(path);
}

function getNavigationPaths(): string[] {
    return [...navigationPaths];
}

/**
 * Should normalize hrefs. MD and YAML files will be ignored.
 * @param href
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
 * @private
 */
function _copyTocDir(tocPath: string, destDir: string) {
    const {dir: tocDir} = parse(tocPath);
    const files: string[] = walkSync(tocDir, {globs: ['**/*.*']});

    files.forEach((relPath) => {
        const from = resolve(tocDir, relPath);
        const to = resolve(destDir, relPath);

        shell.mkdir('-p', parse(to).dir);
        copyFileSync(from, to);
    });
}

/**
 * Replaces include fields in toc file by resolved toc.
 * @param items
 * @param tocDir
 * @param sourcesDir
 * @private
 */
function _replaceIncludes(items: YfmToc[], tocDir: string, sourcesDir: string) {
    return items.reduce((acc, item) => {
        if (item.include) {
            try {
                const {path} = item.include;
                const includeTocPath = resolve(sourcesDir, path);
                const includeToc = safeLoad(readFileSync(includeTocPath, 'utf8'));

                _copyTocDir(includeTocPath, tocDir);
                item.items = (item.items || []).concat(includeToc.items);
                delete item.include;
            } catch (err) {
                console.error('Error while including toc.', err);
                delete item.include;
                return acc;
            }
        }

        if (item.items) {
            item.items = _replaceIncludes(item.items, tocDir, sourcesDir);
        }

        return acc.concat(item);
    }, [] as YfmToc[]);
}

export default {
    add,
    getForPath,
    getNavigationPaths,
};
