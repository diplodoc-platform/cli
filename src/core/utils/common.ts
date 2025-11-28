import {isObject} from 'lodash';

import {bounded} from './decorators';

export const all = Promise.all.bind(Promise);

export const race = Promise.race.bind(Promise);

export function noop() {}

export function get<K extends string>(key: K) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function <T extends Record<K, any>>(
        object: T,
    ): T extends Record<K, infer V> ? V : never {
        return object[key];
    };
}

export function zip<T = unknown>(keys: string[], values: T[]) {
    return keys.reduce((acc, key, index) => {
        acc[key] = values[index];
        return acc;
    }, {} as Hash<T>);
}

export function own<V = unknown, T extends string = string>(
    box: unknown,
    field: T,
): box is Record<T, V> {
    return (
        Boolean(box && typeof box === 'object') && Object.prototype.hasOwnProperty.call(box, field)
    );
}

export function copyJson<T extends object>(
    json: T | undefined,
): T extends DeepFrozen<infer R> ? R : T | undefined {
    // @ts-ignore
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

export function fallbackLang(lang: string) {
    if (['kz', 'ua', 'be', 'ru'].includes(lang)) {
        return 'ru';
    }

    return 'en';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Defer<T = any> {
    promise: Promise<T>;

    resolve!: (result: T) => void;

    reject!: (error: unknown) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

type CancelAPI = {
    cancel: () => void;
    skip: () => void;
};

export function wait(delay: number, action = () => {}): Promise<void> & CancelAPI {
    let timeout: NodeJS.Timeout;
    const promise = new Promise((resolve) => {
        timeout = setTimeout(resolve, delay);
    }).then(() => action());

    Object.assign(promise, {
        cancel: () => clearTimeout(timeout),
        skip: () => {
            action = () => {};
        },
    });

    return promise as Promise<void> & CancelAPI;
}

export type Bucket<T> = {
    get(): T;
    set(value: T): void;
};

export function bucket<T>() {
    let _value: T;

    return {
        get: () => _value,
        set: (value: T) => {
            _value = value;
        },
    };
}

export class Buckets<T> {
    private scope: Map<string, T> = new Map();

    @bounded
    bind(key: string) {
        return {
            get: () => this.get(key),
            set: (value: T) => this.set(key, value),
        };
    }

    @bounded
    set(key: string, value: T) {
        this.scope.set(key, value);
    }

    @bounded
    get(key: string): T {
        return this.scope.get(key) as T;
    }

    @bounded
    delete(key: string) {
        this.scope.delete(key);
    }
}

export function normalizeIgnorePatterns(patterns: string[]): string[] {
    return patterns.map((rule: string) => rule.replace(/\/*$/g, '/**'));
}
