import {uniq} from 'lodash';

export type Scope = {
    scope: Hash;
    path: string;
};

type Resolver = (path: string) => {
    track: (path: RelativePath, scope: string, prefix: string) => void;
    missed: (path: RelativePath, prefix: string) => void;
    keys: () => string[];
} & (
    | {
          value: unknown;
          scope: string;
      }
    | {
          value?: undefined;
          scope?: undefined;
      }
);

export function proxy<T extends object>(path: RelativePath, resolve: Resolver, prefix?: string) {
    const proxied = new Proxy(
        {},
        {
            has: (_target, prop: string) => {
                const {value, scope, track, missed} = resolve(prop);

                if (value === undefined) {
                    missed(path, full(prefix, prop));
                    return false;
                }

                track(path, scope, full(prefix, prop));

                return true;
            },

            get: (_target, prop: string) => {
                // @ts-ignore
                if (typeof Object.prototype[prop] === 'function') {
                    // @ts-ignore
                    return Object.prototype[prop].bind(proxied);
                }

                const {value, scope, track, missed} = resolve(prop);

                if (value === undefined) {
                    missed(path, full(prefix, prop));
                    return undefined;
                }

                if (typeof prop === 'symbol') {
                    return value;
                }

                track(path, scope, full(prefix, prop));

                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return proxy(
                        path,
                        (prop: string) => ({
                            value: (value as Hash)[prop],
                            scope,
                            track,
                            missed,
                            keys: () => Object.keys(value),
                        }),
                        full(prefix, prop),
                    );
                }

                return value;
            },

            getOwnPropertyDescriptor: (_target, prop: string) => {
                const {value, scope, track, missed} = resolve(prop);

                if (value === undefined) {
                    missed(path, full(prefix, prop));
                    return undefined;
                }

                track(path, scope, full(prefix, prop));

                return {configurable: true, enumerable: true, value};
            },

            ownKeys: () => {
                const {keys} = resolve(path);

                return uniq(keys());
            },
        },
    ) as T;

    return proxied;
}

function full(prefix: string | undefined, prop: string) {
    return prefix ? prefix + '.' + prop : prop;
}
