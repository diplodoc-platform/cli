import type {LoaderContext} from '../loader';
import type {AssetInfo} from '../types';

import {fs, rebasePath} from '~/core/utils';

import {filterRanges, findDefs, findLinksInfo, findPcImages} from '../utils';

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
        const fullPath = loaderContext.fullPath(path);
        const size = fs.statSync(fullPath).size;
        assetSizes.set(path, size);
        return size;
    } catch (error) {
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
