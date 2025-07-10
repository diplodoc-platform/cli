import type {TextFilter} from './types';

import {evaluate} from '@diplodoc/liquid';
import {isExternalHref, own} from '~/core/utils';

export function isRelative(path: AnyPath): path is RelativePath {
    return /^\.{1,2}\//.test(path) || !/^(\w{0,7}:)?\/\//.test(path);
}

export function isEntryItem(item: unknown): item is {href: string} {
    return own<string, 'href'>(item, 'href') && !isExternalHref(item.href);
}

export function getFirstValuable<T>(
    items: TextFilter[] | string,
    vars: Hash,
    fallback?: T,
): T | undefined {
    if (typeof items === 'string') {
        items = [{text: items, when: true}];
    }

    if (!Array.isArray(items)) {
        items = [];
    }

    for (const item of items) {
        let {when = true} = item;
        delete item.when;

        if (typeof when === 'string') {
            when = Boolean(evaluate(when, vars));
        }

        if (when) {
            return item.text as T;
        }
    }

    return fallback;
}
