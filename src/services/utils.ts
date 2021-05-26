import evalExp from '@doc-tools/transform/lib/liquid/evaluation';
import {Filter} from '../models';

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
export function filterFiles<T extends Filter>(items: T[], itemsKey: string, vars: Record<string, string>, options?: FilterFilesOptions): T[] {
    const {
        resolveConditions,
        removeHiddenTocItems,
    } = options || {};

    if (!Array.isArray(items)) {
        const errorMessage
            = `Error while filtering: item has invalid key '${itemsKey}' equals ${JSON.stringify(items)}`;
        throw new Error(errorMessage);
    }

    return items.reduce((result: T[], item: T) => {
        let shouldProcessItem = true;

        if (resolveConditions) {
            const {when} = item;
            shouldProcessItem =
                when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars));

            delete item.when;
        }

        if (shouldProcessItem && removeHiddenTocItems) {
            shouldProcessItem = !item.hidden;

            delete item.hidden;
        }

        if (shouldProcessItem) {
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
