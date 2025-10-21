import type {LoaderContext} from '../loader';
import type {AssetInfo} from '../types';

import {rebasePath} from '~/core/utils';

import {filterRanges, findDefs, findLinksInfo, findPcImages} from '../utils';

export function resolveAssets(this: LoaderContext, content: string) {
    const assets: AssetInfo[] = [];

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
            if (info.path !== null) {
                info.path = rebasePath(this.path, decodeURIComponent(info.path) as RelativePath);
            }

            assets.push(info);
        } catch (error) {
            this.logger.error(`Error processing asset: ${error}`);
        }
    }

    this.api.assets.set([...assets]);

    return content;
}
