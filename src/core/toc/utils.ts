import type {RawTocLabel, TextFilter, Toc} from './types';

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

type TocLabelResult = NonNullable<Toc['label']>;

function isTocLabel(item: TextFilter | RawTocLabel): item is RawTocLabel {
    return 'title' in item;
}

function resolveSingleLabel(
    item: TextFilter | RawTocLabel,
    vars: Hash,
): TocLabelResult | undefined {
    let {when = true} = item;

    if (typeof when === 'string') {
        when = Boolean(evaluate(when, vars));
    }

    if (!when) {
        return undefined;
    }

    if (isTocLabel(item)) {
        const result: TocLabelResult = {title: item.title};
        if (item.description) {
            result.description = item.description;
        }
        if (item.theme) {
            result.theme = item.theme;
        }
        return result;
    }

    return {title: item.text};
}

/**
 * Resolves label from all supported input formats to the TocLabel output format.
 * Supports: string, TextFilter[], RawTocLabel, RawTocLabel[]
 */
export function resolveLabel(
    value: string | TextFilter[] | RawTocLabel | RawTocLabel[],
    vars: Hash,
): TocLabelResult | undefined {
    if (typeof value === 'string') {
        return {title: value};
    }

    if (!Array.isArray(value)) {
        if (typeof value === 'object' && value !== null) {
            return resolveSingleLabel(value, vars);
        }
        return undefined;
    }

    for (const item of value) {
        const result = resolveSingleLabel(item, vars);
        if (result) {
            return result;
        }
    }

    return undefined;
}
