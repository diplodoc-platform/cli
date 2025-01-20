import {isObject} from 'lodash';
import type {Hook, HookMap} from 'tapable';

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

export type HookMeta = {
    service: string;
    hook: string;
    name: string;
    type: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function intercept<T extends Hash<Hook<any, any> | HookMap<any>>>(
    service: string,
    hooks: T,
): T {
    for (const [hook, handler] of Object.entries(hooks)) {
        handler.intercept({
            register: (info) => {
                const {type, name, fn} = info;
                const meta = {service, hook, name, type};

                if (type === 'promise') {
                    info.fn = async (...args: unknown[]) => {
                        try {
                            return await fn(...args);
                        } catch (error) {
                            if (error instanceof Error) {
                                Object.assign(error, {hook: meta});
                            }

                            throw error;
                        }
                    };
                } else if (type === 'sync') {
                    info.fn = (...args: unknown[]) => {
                        try {
                            return fn(...args);
                        } catch (error) {
                            if (error instanceof Error) {
                                Object.assign(error, {hook: meta});
                            }

                            throw error;
                        }
                    };
                } else {
                    throw new TypeError('Unexpected hook tap type - ' + type);
                }

                return info;
            },
        });
    }

    return hooks;
}
