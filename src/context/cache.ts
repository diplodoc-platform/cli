import {CacheContext} from '@diplodoc/transform/lib/typings';

export class CacheContextCli implements CacheContext {
    cache: {
        [key: string]: string | null | undefined;
    } = {};

    get(key: string) {
        return this.cache[key];
    }

    set(key: string, value: string) {
        this.cache[key] = value;
    }
}
