import {isObject} from 'lodash';

export function own<V = unknown, T extends string = string>(
    box: unknown,
    field: T,
): box is {[P in T]: V} {
    return (
        Boolean(box && typeof box === 'object') && Object.prototype.hasOwnProperty.call(box, field)
    );
}

export function freeze<T>(target: T, visited = new Set()): T {
    if (!visited.has(target)) {
        visited.add(target);

        if (Array.isArray(target)) {
            target.forEach((item) => freeze(item, visited));
        }

        if (isObject(target) && !Object.isSealed(target)) {
            Object.freeze(target);
            Object.keys(target).forEach((key) =>
                freeze(target[key as keyof typeof target], visited),
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
