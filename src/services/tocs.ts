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

export default {
    init,
    getForPath,
    getNavigationPaths,
    getTocDir,
    setNavigationPaths,
};
