import {excludedMetaFields} from '~/constants';

export function filterMeta<T>(meta: Hash<T>[]): Hash<T>[] {
    return meta.filter((item: Hash) => {
        if (!item.name) return true;

        return !excludedMetaFields.includes(item.name);
    });
}
