import type {TextFilter} from '~/commands/build/core/toc/types';
import evalExp from '@diplodoc/transform/lib/liquid/evaluation';

export function isRelative(path: AnyPath): path is RelativePath {
    return /^\.{1,2}\//.test(path) || !/^(\w{0,7}:)?\/\//.test(path);
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
            when = evalExp(when, vars);
        }

        if (when) {
            return item.text as T;
        }
    }

    return fallback;
}