import {Defer, bounded, normalizePath} from '~/core/utils';
import {dirname, join} from 'node:path';

export function uniquePaths(paths: (RelativePath | undefined)[]) {
    const results: Set<RelativePath> = new Set();

    for (const link of paths.filter(Boolean)) {
        results.add((link as RelativePath).split('#')[0] as RelativePath);
    }

    return [...results];
}

export function rebasePath(root: RelativePath, path: RelativePath) {
    return normalizePath(join(dirname(root), path));
}

export function zipmap(map: Hash<string | number>) {
    const result = [];

    for (const [key, value] of Object.entries(map)) {
        const prop = Number(key) > 0 ? Number(key) : 0;
        result[prop] = Number(value);
    }

    return result;
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
