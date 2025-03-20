import type {LoaderContext} from '../loader';
import type {AssetInfo} from '../types';

import {parseLocalUrl, rebasePath} from '~/core/utils';

import {filterRanges, findDefs, findLinks} from '../utils';

export function resolveAssets(this: LoaderContext, content: string) {
    const assets = new Set<NormalizedPath>();

    const exclude = [
        ...this.api.deps.get().map(({location}) => location),
        ...this.api.comments.get(),
    ];

    const defs = filterRanges(exclude, findDefs(content, true));
    const links = filterRanges(exclude, findLinks(content, true));

    for (const {link} of [...defs, ...links]) {
        const asset = parseLocalUrl<AssetInfo>(link);

        if (asset && asset.path) {
            try {
                const path = rebasePath(this.path, decodeURIComponent(asset.path) as RelativePath);
                assets.add(path);
            } catch {}
        }
    }

    this.api.assets.set([...assets]);

    return content;
}
