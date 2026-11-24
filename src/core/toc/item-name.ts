import type {Toc, TocItem} from './types';

import {dirname, join} from 'node:path';

import {isExternalHref, normalizePath} from '~/core/utils';

type TocItemName = {
    name: string;
    hidden: boolean;
};

function indexTocItemNames(toc: Toc) {
    const names = new Map<NormalizedPath, TocItemName>();
    const tocDir = dirname(toc.path);

    function visit(items: TocItem[] = [], ancestorHidden = false) {
        for (const {href, name, hidden, items: children} of items) {
            const isHidden = ancestorHidden || hidden === true;

            if (name && href && !isExternalHref(href)) {
                const path = normalizePath(join(tocDir, href));
                const current = names.get(path);

                if (!current || (current.hidden && !isHidden)) {
                    names.set(path, {name, hidden: isHidden});
                }
            }

            visit(children, isHidden);
        }
    }

    visit(toc.items);

    return names;
}

const indexes = new WeakMap<Toc, Map<NormalizedPath, TocItemName>>();

export function getTocItemName(toc: Toc, path: NormalizedPath) {
    let names = indexes.get(toc);
    if (!names) {
        names = indexTocItemNames(toc);
        indexes.set(toc, names);
    }

    return names.get(path)?.name;
}
