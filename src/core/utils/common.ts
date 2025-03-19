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

type OnDemandResolver = (file: NormalizedPath, from: NormalizedPath[]) => Promise<unknown>;

type OnDemandMap<T> = Map<NormalizedPath, Defer<T> | T>;

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

export class Demand<T> {
    private scope: OnDemandMap<T> = new Map();

    private ondemand: OnDemandResolver;

    constructor(ondemand: OnDemandResolver) {
        this.ondemand = ondemand;
    }

    async onDemand(file: NormalizedPath, from: NormalizedPath[]): Promise<T> {
        if (!this.scope.has(file)) {
            const wait = new Defer();
            this.scope.set(file, wait);
            this.ondemand(file, from).catch(wait.reject);
        }

        const data = this.scope.get(file);

        return data instanceof Defer ? await data.promise : (data as T);
    }

    @bounded
    proxy(file: NormalizedPath) {
        return {
            get: () => this.get(file),
            set: (value: T) => this.set(file, value),
        };
    }

    @bounded
    set(file: NormalizedPath, value: T) {
        if (this.scope.has(file)) {
            const wait = this.scope.get(file);
            if (wait instanceof Defer) {
                wait.resolve(value);
            } else {
                throw new Error('Override of file deps is not allowed');
            }
        }

        this.scope.set(file, value);
    }

    @bounded
    get(file: NormalizedPath): T {
        return this.scope.get(file) as T;
    }
}
