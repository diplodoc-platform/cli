import {isObject} from 'lodash';

export function own<V = unknown, T extends string = string>(
    box: unknown,
    field: T,
): box is Record<T, V> {
    return (
        Boolean(box && typeof box === 'object') && Object.prototype.hasOwnProperty.call(box, field)
    );
}

export function copyJson<T extends object>(json: T | undefined): T {
    return json ? JSON.parse(JSON.stringify(json)) : json;
}

export function freezeJson<T>(target: T, visited = new Set()): T {
    if (!visited.has(target)) {
        visited.add(target);

        if (Array.isArray(target)) {
            target.forEach((item) => freezeJson(item, visited));
        }

        if (isObject(target) && !Object.isSealed(target)) {
            Object.freeze(target);
            Object.keys(target).forEach((key) =>
                freezeJson(target[key as keyof typeof target], visited),
            );
        }
    }

    return target;
}

export function errorMessage(error: unknown): string {
    if (typeof error === 'string') {
        return error;
    }

    if (own<string, 'message'>(error, 'message')) {
        return error.message;
    }

    return String(error);
}

const DEFAULT_CONCURRENCY = 500;

export function concurrently<T, R>(
    items: T[],
    mapper: (item: T) => Promise<R | undefined>,
    concurrency = DEFAULT_CONCURRENCY,
): Promise<R[]> {
    return pMap(items, mapper, {concurrency});
}
