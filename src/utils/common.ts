import {cloneDeepWith, flatMapDeep, isArray, isObject, isString} from 'lodash';
import {resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';
import {FsContext} from '@diplodoc/transform/lib/typings';

export function findAllValuesByKeys(obj: object, keysToFind: string[]) {
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
    modifyFn: (value: string) => string | undefined,
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

export async function checkPathExists(fs: FsContext, path: string, parentFilePath: string) {
    const includePath = resolveRelativePath(parentFilePath, path);

    return fs.existAsync(includePath);
}
