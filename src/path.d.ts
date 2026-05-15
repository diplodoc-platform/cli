type UnresolvedPath = string & {
    __type: 'path';
    __mode: 'unresolved';
};

type AbsolutePath = string &
    (
        | {
              __type: 'path';
              __mode: 'absolute';
          }
        | `/${string}`
    );

type RelativePath = string &
    (
        | {
              __type: 'path';
              __mode: 'relative';
          }
        | `./${string}`
    );

/**
 * This is unix-like relative path with truncated heading ./
 */
type NormalizedPath = string & {
    __type: 'path';
    __mode: 'relative';
    __fix: 'normalized';
};

type AnyPath = string | UnresolvedPath | AbsolutePath | RelativePath | NormalizedPath;

type URIString = string & {
    __type: 'uri';
    __mode: 'relative';
    __fix: 'normalized';
};

declare module 'normalize-path' {
    const normalize: (path: string, strip?: boolean) => NormalizedPath;

    export = normalize;
}

declare module 'node:path' {
    interface PlatformPath {
        normalize<T extends AnyPath>(path: T): T;

        join<T extends AnyPath>(path: T, ...paths: string[]): T;

        resolve(...paths: string[]): AbsolutePath;

        isAbsolute(path: AnyPath): path is AbsolutePath;

        relative(from: AnyPath, to: AnyPath): RelativePath;

        dirname<T extends AnyPath>(path: T): T;

        basename(path: AnyPath, suffix?: string): RelativePath;

        extname(path: AnyPath): string;

        sep: string;
    }
}
