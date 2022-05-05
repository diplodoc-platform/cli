import evalExp from '@doc-tools/transform/lib/liquid/evaluation';
import {Filter, TextItems} from '../models';

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
        const errorMessage
            = `Error while filtering: item has invalid key '${itemsKey}' equals ${JSON.stringify(items)}`;
        throw new Error(errorMessage);
    }

    return items.reduce((result: T[], item: T) => {
        const useItem = shouldProcessItem(item, vars, options);

        if (useItem) {
            const property = item[itemsKey] as T[] | undefined;

            if (property === undefined) {
                result.push(item);
            } else {
                const filteredProperty = filterFiles(property, itemsKey, vars, options);

                if (filteredProperty.length !== 0) {
                    result.push({
                        ...item,
                        [itemsKey]: filteredProperty,
                    });
                }
            }
        }

        return result;
    }, []);
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

function shouldProcessItem<T extends Filter>(item: T, vars: Record<string, string>, options?: FilterFilesOptions) {
    const {resolveConditions, removeHiddenTocItems} = options || {};
    let useItem = true;

    if (resolveConditions) {
        const {when} = item;
        useItem =
            when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars));

        delete item.when;
    }

    if (useItem && removeHiddenTocItems) {
        useItem = !item.hidden;

        delete item.hidden;
    }

    return useItem;
}

export function isObject(o: unknown): o is object {
    return typeof o === 'object' && o !== null;
}
