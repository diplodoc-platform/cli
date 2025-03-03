import {cloneDeepWith, isString} from 'lodash';

export function modifyValuesByKeys(
    object: object,
    keys: string[],
    modify: (value: string) => string,
) {
    // Clone the object deeply with a customizer function that modifies matching keys
    return cloneDeepWith(object, (value: unknown, key) => {
        if (keys.includes(key as string) && isString(value)) {
            return modify(value);
        }

        return undefined;
    });
}
