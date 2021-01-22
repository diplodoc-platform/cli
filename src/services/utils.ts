import evalExp from '@doc-tools/transform/lib/liquid/evaluation';
import {Filter} from '../models';

/**
 * Filters file by expression and removes empty file's items.
 * @param items
 * @param itemsKey
 * @param vars
 * @return {T[]}
 */
export function filterFiles<T extends Filter>(items: T[], itemsKey: string, vars: Record<string, string>): T[] {
    if (!Array.isArray(items)) {
        const errorMessage
            = `Error while filtering: item has invalid key '${itemsKey}' equals ${JSON.stringify(items)}`;
        throw new Error(errorMessage);
    }

    return items.reduce((result: T[], item: T) => {
        const {when} = item;
        const whenResult = when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars));

        delete item.when;

        if (whenResult) {
            const property = item[itemsKey] as T[] | undefined;

            if (property === undefined) {
                result.push(item);
            } else {
                const filteredProperty = filterFiles(property, itemsKey, vars);

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
