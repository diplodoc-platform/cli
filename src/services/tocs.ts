import type {TocService} from '../commands/build/core/toc';
import type {YfmToc} from '../models';

import {dirname} from 'node:path';
import {normalizePath} from '../utils';

export interface TocServiceData {
    navigationPaths: string[];
}

let navigationPaths: TocServiceData['navigationPaths'];

let toc: TocService;
async function init(service: TocService) {
    toc = service;
    setNavigationPaths(toc.entries);
}

function getForPath(path: string): [string | null, YfmToc | null] {
    return toc.for(normalizePath(path)) as unknown as [string, YfmToc];
}

function getNavigationPaths(): string[] {
    return navigationPaths || [...toc.entries];
}

function getTocDir(pagePath: string): string {
    return dirname(toc.for(normalizePath(pagePath))[0]);
}

function setNavigationPaths(paths: TocServiceData['navigationPaths']) {
    navigationPaths = paths;
}

function _searchForTocItemProp(filePath: string, prop: keyof YfmToc, items: YfmToc[]) {
    const langBasePath = filePath.replace(/\\/g, '/').split('/')[0];
    const fileName = filePath.replace(`${langBasePath}/`, '');
    const stack: {tocItemList: IterableIterator<YfmToc>; parentPropValue: YfmToc[keyof YfmToc]}[] =
        [{tocItemList: items[Symbol.iterator](), parentPropValue: null}];

    while (stack.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const {tocItemList, parentPropValue} = stack.pop()!;
        const result = tocItemList.next();

        if (result.done) {
            continue;
        }

        const {value} = result;

        if (value.href === fileName) {
            if (prop in value) {
                return value[prop];
            } else {
                return parentPropValue;
            }
        }

        stack.push({tocItemList, parentPropValue});

        if (value?.items?.length > 0) {
            stack.push({
                tocItemList: value.items[Symbol.iterator](),
                parentPropValue: value[prop] ?? parentPropValue,
            });
        }
    }

    return;
}

function getTocItemPropPerFile(filePath: string, prop: keyof YfmToc) {
    const [_, tocs] = getForPath(filePath);

    if (!tocs) {
        return;
    }

    const itemProp = _searchForTocItemProp(filePath, prop, tocs.items);

    if (!itemProp) {
        return;
    }

    return {[prop]: itemProp as string};
}

export default {
    init,
    getForPath,
    getNavigationPaths,
    getTocDir,
    setNavigationPaths,
    getTocItemPropPerFile,
};
