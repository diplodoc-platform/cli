declare const VERSION: string;
declare const OPENAPI_EXTENSION: string;
declare const GENERIC_INCLUDER_EXTENSION: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hash<T = any> = Record<string, T>;

type ClassType<T = any> = {
    new (...args: any[]): T;
};

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends {} ? DeepPartial<T[P]> : T[P];
};

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

interface NodeRequire {
    resolve: {
        (id: string, options?: {paths?: string[] | undefined}): AbsolutePath;
    };
}

declare module 'node:path' {
    namespace path {
        interface PlatformPath extends PlatformPath {
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

    const path: path.PlatformPath;
    export = path;
}

declare module 'node:fs/promises' {
    import {BufferEncoding, ObjectEncodingOptions} from 'node:fs';

    export function readFile(
        path: AbsolutePath,
        options: ObjectEncodingOptions | BufferEncoding,
    ): Promise<string>;

    export function realpath(
        path: AbsolutePath,
        options?: ObjectEncodingOptions | BufferEncoding | null,
    ): Promise<AbsolutePath>;
}

interface Error {
    code?: string;
}
