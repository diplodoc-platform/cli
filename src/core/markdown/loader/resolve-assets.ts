import type {LoaderContext} from '../loader';
import type {AssetInfo} from '../types';

import {rebasePath} from '~/core/utils';

import {filterRanges, findDefs, findLinksInfo} from '../utils';

export function resolveAssets(this: LoaderContext, content: string) {
    const assets: AssetInfo[] = [];

    const exclude = [
        ...this.api.deps.get().map(({location}) => location),
        ...this.api.comments.get(),
    ];

    const defs = filterRanges(exclude, findDefs(content));
    const links = filterRanges(exclude, findLinksInfo(content));

    for (const info of [...defs, ...links]) {
        try {
            if (info.path !== null) {
                info.path = rebasePath(this.path, decodeURIComponent(info.path) as RelativePath);
            }
            assets.push(info);
        } catch {}
    }

    this.api.assets.set([...assets]);

    return content;
}
