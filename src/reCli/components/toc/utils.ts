import {Filter, type YfmArgv, YfmToc} from '~/models';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';
import {composeFrontMatter} from '@diplodoc/transform/lib/frontmatter';
import {FrontMatter, extractFrontMatter} from '@diplodoc/transform/src/transform/frontmatter';
import path from 'node:path';
import {TocIndexMap} from '~/reCli/components/toc/types';
import {FilterFilesOptions} from '~/services/utils';
import evalExp from '@diplodoc/transform/lib/liquid/evaluation';

export type LiquidFieldOptions = Pick<
    YfmArgv,
    'applyPresets' | 'resolveConditions' | 'useLegacyConditions'
>;

export function liquidFields(
    fields: undefined | string | string[],
    vars: Record<string, unknown>,
    path: string,
    options: LiquidFieldOptions,
) {
    if (typeof fields === 'string') {
        return liquidField(fields, vars, path, options);
    }

    if (!Array.isArray(fields)) {
        return fields;
    }

    return fields.map((item) => {
        if (typeof item === 'string') {
            return liquidField(item, vars, path, options);
        }
        return item;
    });
}

export function liquidField(
    input: string,
    vars: Record<string, unknown>,
    path: string,
    options: LiquidFieldOptions,
) {
    const {applyPresets, resolveConditions, useLegacyConditions} = options;

    if (!applyPresets && !resolveConditions) {
        return input;
    }

    return liquidSnippet(input, vars, path, {
        substitutions: applyPresets,
        conditions: resolveConditions,
        keepNotVar: true,
        withSourceMap: false,
        useLegacyConditions,
    });
}

export function splitMetaAndContent(page: string) {
    const [meta, content] = extractFrontMatter(page);
    return {meta, content};
}

export function joinMetaAndContent(meta: FrontMatter, content: string) {
    return composeFrontMatter(meta, content);
}

export function getPageToc(tocIndex: TocIndexMap, pagePath: string) {
    let toc: YfmToc | undefined;
    let tocPath: string | undefined;
    let cursor = path.dirname(pagePath);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const tocPathLocal = path.join(cursor, 'toc.yaml');
        const ti = tocIndex.get(tocPathLocal);
        if (ti) {
            toc = ti.toc;
            tocPath = tocPathLocal;
            break;
        }
        const prevCursor = cursor;
        cursor = path.dirname(cursor);
        if (prevCursor === cursor) {
            break;
        }
    }
    return {toc, tocPath};
}

export function firstFilterItem<T extends Filter>(
    itemOrItems: T | T[],
    vars: Record<string, string>,
    options?: FilterFilesOptions,
) {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];

    const filteredItems = items.reduce<T[]>((result: T[], item) => {
        const useItem = shouldProcessItem(item, vars, options);

        if (useItem) {
            result.push(item);
        }

        return result;
    }, []);

    return filteredItems[0];
}

function shouldProcessItem<T extends Filter>(
    item: T,
    vars: Record<string, string>,
    options?: FilterFilesOptions,
) {
    const {resolveConditions, removeHiddenTocItems} = options || {};
    let useItem = true;

    if (resolveConditions) {
        const {when} = item;
        useItem =
            when === true ||
            when === undefined ||
            (typeof when === 'string' && evalExp(when, vars));

        delete item.when;
    }

    if (useItem && removeHiddenTocItems) {
        useItem = !item.hidden;

        delete item.hidden;
    }

    return useItem;
}
