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
    return items.filter((item: T) => {
        const {when} = item;
        const whenResult = when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars));

        delete item.when;

        if (whenResult) {
            let property = item[itemsKey] as Filter[];
            if (property) {
                property = filterFiles(property, itemsKey, vars);
            }
            // If file has no items, don't include it into navigation tree.
            return !(Array.isArray(property) && property.length === 0);
        }

        return whenResult;
    });
}
