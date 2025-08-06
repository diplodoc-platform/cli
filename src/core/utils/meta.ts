import {YfmFields} from '~/constants';

export function filterMeta<T>(meta: Hash<T>[]): Hash<T>[] {
    const excludedFields = Object.values(YfmFields);

    return meta.filter((item: Hash) => {
        if (!item.name) return true;

        return !excludedFields.includes(item.name);
    });
}
