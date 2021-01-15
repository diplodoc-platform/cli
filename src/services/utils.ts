import evalExp from '@doc-tools/transform/lib/liquid/evaluation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ItemType = {[key: string]: any};

/**
 * Filters file by expression and removes empty file's items.
 * @param items
 * @param itemsKey
 * @param vars
 * @return {T[]}
 */
export function filterFiles(items: ItemType[], itemsKey: string, vars: Record<string, string>): ItemType[] {
    return items
        .filter((item: ItemType) => {
            const {when} = item;
            const whenResult = when === true || when === undefined || (typeof when === 'string' && evalExp(when, vars));

            delete item.when;

            return whenResult;
        })
        .filter((el: ItemType) => {
            let item = el[itemsKey];
            if (item) {
                item = filterFiles(item, itemsKey, vars);
            }
            // If file has no items, don't include it into navigation tree.
            return !(Array.isArray(item) && item.length === 0);
        });
}
