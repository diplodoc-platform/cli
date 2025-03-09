import {isObject} from 'lodash';
import {bounded} from './decorators';

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

export class Defer<T = any> {
    promise: Promise<T>;

    resolve!: (result: T) => void;

    reject!: (error: Error) => void;

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

export class Demand<T> {
    private scope: OnDemandMap<T> = new Map();

    private ondemand: OnDemandResolver;

    constructor(ondemand: OnDemandResolver) {
        this.ondemand = ondemand;
    }

    async onDemand<R>(
        file: NormalizedPath,
        from: NormalizedPath[],
        map: (value: R) => Promise<T> = async (value: R) => value as unknown as T,
    ): Promise<T> {
        if (!this.scope.has(file)) {
            const wait = new Defer();
            this.scope.set(file, wait as Defer);
            this.ondemand(file, from).catch(wait.reject);
        }

        const data = this.scope.get(file);
        const result = data instanceof Defer ? await data.promise : data;

        return map(result as R);
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

    get(file: NormalizedPath): T {
        return this.scope.get(file) as T;
    }
}
