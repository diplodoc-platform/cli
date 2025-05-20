import {isObject} from 'lodash';
import {bounded} from './decorators';

export const all = Promise.all.bind(Promise);

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

export function wait(delay: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, delay);
    });
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
