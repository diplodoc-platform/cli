import {cloneDeepWith, flatMapDeep, isArray, isObject, isString} from 'lodash';
import {isFileExists, resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';

export function findAllValuesByKeys(obj: object, keysToFind: string[]): string[] {
    return flatMapDeep(obj, (value: string | string[], key: string) => {
        if (
            keysToFind?.includes(key) &&
            (isString(value) || (isArray(value) && value.every(isString)))
        ) {
            return [value];
        }

        if (isObject(value)) {
            return findAllValuesByKeys(value, keysToFind);
        }

        return [];
    });
}

export function modifyValuesByKeys(
    originalObj: object,
    keysToFind: string[],
    modifyFn: (value: string) => string,
) {
    // Clone the object deeply with a customizer function that modifies matching keys
    return cloneDeepWith(originalObj, (value: unknown, key) => {
        if (keysToFind.includes(key as string) && isString(value)) {
            return modifyFn(value);
        }

        return value;
    });
}

export function getLinksWithContentExtersion(link: string) {
    return new RegExp(/^\S.*\.(md|ya?ml|html)$/gm).test(link);
}

export function getLinksWithExtension(link: string) {
    const oneLineWithExtension = new RegExp(
        /^\S.*\.(md|html|yaml|svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm,
    );

    return oneLineWithExtension.test(link);
}

export function checkPathExists(path: string, parentFilePath: string) {
    const includePath = resolveRelativePath(parentFilePath, path);

    return isFileExists(includePath);
}

export function own<V = unknown, T extends string = string>(
    box: unknown,
    field: T,
): box is {[p in T]: V} {
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
