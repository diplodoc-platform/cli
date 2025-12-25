import type {LoaderContext} from '../loader';
import type {AssetInfo} from '../types';

import {join} from 'node:path';

import {fs, normalizePath, rebasePath} from '~/core/utils';

import {filterRanges, findDefs, findLinksInfo, findPcImages} from '../utils';

function fixUnreachableLink(path: RelativePath, loaderContext: LoaderContext) {
    let newPath = path;
    const pathnameParts = normalizePath(path).split('/');
    const relativePartsCount = pathnameParts.filter((part: string) => part === '..').length;
    let includedFilePath;

    for (let i = 0; i <= relativePartsCount; i++) {
        try {
            includedFilePath = normalizePath(
                join(loaderContext.input, pathnameParts.slice(i).join('/')),
            );
            fs.realpathSync(includedFilePath);
            if (i > 0) {
                newPath = normalizePath(pathnameParts.slice(i).join('/'));
                loaderContext.logger.error(`Path was fixed from ${path} 
                        to ${newPath}`);
            }
            return newPath;
        } catch {
            if (i === relativePartsCount - 1) {
                return newPath;
            } else {
                continue;
            }
        }
    }
    return newPath;
}

function getSize(
    path: RelativePath,
    loaderContext: LoaderContext,
    assetSizes: Map<RelativePath, number>,
) {
    if (path === null) {
        return 0;
    }
    if (assetSizes.has(path)) {
        return assetSizes.get(path) as number;
    }

    try {
        const fixedPath = fixUnreachableLink(path, loaderContext);
        const fullPath = loaderContext.fullPath(fixedPath);
        const size = fs.statSync(fullPath).size;
        assetSizes.set(path, size);
        return size;
    } catch {
        assetSizes.set(path, 0);
        return 0;
    }
}

export function resolveAssets(this: LoaderContext, content: string) {
    const assets: AssetInfo[] = [];
    const assetSizes = new Map<RelativePath, number>();

    const exclude = [
        ...this.api.deps.get().map(({location}) => location),
        ...this.api.comments.get(),
        ...this.api.blockCodes.get(),
    ];

    const defs = filterRanges(exclude, findDefs(content));
    const links = filterRanges(exclude, findLinksInfo(content));
    const pcImages = filterRanges(exclude, findPcImages(content));

    for (const info of [...defs, ...links, ...pcImages]) {
        try {
            if (info.path !== null && !info.path?.startsWith('*') && !info.path?.includes('%')) {
                info.path = rebasePath(this.path, decodeURIComponent(info.path) as RelativePath);
            }

            let size = 0;
            if (['def', 'image'].includes(info.type) && info.subtype === 'image') {
                size = getSize(info.path, this, assetSizes);
            }

            assets.push({...info, size});
        } catch (error) {
            this.logger.warn(`Error processing asset from ${this.path} to ${info.path}: ${error}`);
        }
    }

    this.api.assets.set([...assets]);

    return content;
}
