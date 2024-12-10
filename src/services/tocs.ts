import {YfmToc} from '../models';
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

function getTocDir(pagePath: string): string {
    return toc.for(pagePath)[0];
}

function setNavigationPaths(paths: TocServiceData['navigationPaths']) {
    navigationPaths = paths;
}

function getCopyFileMap() {
    return tocFileCopyMap;
}

function realpath(path: string) {
    return toc.realpath(path as RelativePath);
}

export default {
    init,
    getForPath,
    getNavigationPaths,
    getTocDir,
    setNavigationPaths,
    realpath,
};
