import type {YfmToc} from '~/models';

import {basename, dirname, extname, join} from 'node:path';

import {filterFiles} from '../services/utils';
import {isExternalHref} from './url';
import {getSinglePageUrl} from './singlePage';

function baseTransformToc(toc: YfmToc, transformItemHref: (href: string) => string): YfmToc {
    const localToc: YfmToc = JSON.parse(JSON.stringify(toc));

    if (localToc.items) {
        localToc.items = filterFiles(
            localToc.items,
            'items',
            {},
            {
                removeHiddenTocItems: true,
            },
        );
    }

    const queue = [localToc];

    while (queue.length) {
        const item = queue.shift();

        if (!item) {
            continue;
        }

        const {items, href} = item;

        if (items) {
            queue.push(...items);
        }

        if (href) {
            item.href = transformItemHref(href);
        }
    }

    return localToc;
}

export function transformToc(toc: YfmToc, tocDir: string) {
    return baseTransformToc(toc, (href: string) => {
        if (isExternalHref(href)) {
            return href;
        }

        if (href.endsWith('/')) {
            href += 'index.yaml';
        }

        const fileExtension: string = extname(href);
        const filename: string = basename(href, fileExtension) + '.html';

        return join(tocDir, dirname(href), filename);
    });
}

export function transformTocForSinglePage(toc: YfmToc, tocDir: string) {
    return baseTransformToc(toc, (href: string) => {
        if (isExternalHref(href)) {
            return href;
        }

        return getSinglePageUrl(tocDir, href);
    });
}
