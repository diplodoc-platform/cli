import evalExp from '@diplodoc/transform/lib/liquid/evaluation';
import {Filter, TextItems} from '../models';
import liquid from '@diplodoc/transform/lib/liquid';
import {ArgvService} from './index';

export interface FilterFilesOptions {
    resolveConditions?: boolean;
    removeHiddenTocItems?: boolean;
}

/**
 * Filters file by expression and removes empty file's items.
 * @param items
 * @param itemsKey
 * @param vars
 * @param options
 * @return {T[]}
 */
export function filterFiles<T extends Filter>(
    items: T[],
    itemsKey: string,
    vars: Record<string, string>,
    options?: FilterFilesOptions,
): T[] {
    if (!Array.isArray(items)) {
        return [];
    }

    const reducer = (results: T[], item: T) => {
        if (shouldProcessItem(item, vars, options)) {
            const prop = item[itemsKey] as T[];

            if (prop) {
                const filteredProperty = filterFiles(prop, itemsKey, vars, options);

                if (filteredProperty.length) {
                    results.push({
                        ...item,
                        [itemsKey]: filteredProperty,
                    });
                }
            } else {
                results.push(item);
            }
        }

        return results;
    };

    return items.reduce(reducer, []);
}

export function filterTextItems(
    items: undefined | TextItems,
    vars: Record<string, string>,
    options?: FilterFilesOptions,
) {
    if (!Array.isArray(items)) {
        return items;
    }

    return items.reduce((result: string[], item) => {
        if (!isObject(item)) {
            result.push(item);
            return result;
        }

        const useItem = shouldProcessItem(item, vars, options);

        if (useItem) {
            if (Array.isArray(item.text)) {
                result.push(...item.text);
            } else {
                result.push(item.text);
            }
        }

        return result;
    }, []);
}

export function firstFilterTextItems(
    items: TextItems,
    vars: Record<string, string>,
    options?: FilterFilesOptions,
) {
    const filteredItems = filterTextItems(items, vars, options);

    if (!Array.isArray(filteredItems)) {
        return filteredItems || '';
    }

    return filteredItems[0] || '';
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

export function liquidFields(
    fields: undefined | string | string[],
    vars: Record<string, unknown>,
    path: string,
) {
    if (typeof fields === 'string') {
        return liquidField(fields, vars, path);
    }

    if (!Array.isArray(fields)) {
        return fields;
    }

    return fields.map((item) => {
        if (typeof item === 'string') {
            return liquidField(item, vars, path);
        }
        return item;
    });
}

export function liquidField(input: string, vars: Record<string, unknown>, path: string) {
    const {applyPresets, resolveConditions} = ArgvService.getConfig();

    if (!applyPresets && !resolveConditions) {
        return input;
    }

    return liquid(input, vars, path, {
        substitutions: applyPresets,
        conditions: resolveConditions,
        keepNotVar: true,
        withSourceMap: false,
    });
}

export function isObject(o: unknown): o is object {
    return typeof o === 'object' && o !== null;
}
