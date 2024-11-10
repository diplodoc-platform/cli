const VERSION: string;

type Hash<T = any> = Record<string, T>;

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Record<any, any> ? DeepPartial<T[P]> : T[P];
};

type UnresolvedPath = string & {
    __type: 'unresolved';
};

type AbsolutePath = string & {
    __type: 'absolute';
};

type RelativePath = string & {
    __type: 'relative';
};

type NormalizedPath = string & {
    __type: 'normalized';
};

type AnyPath = string | UnresolvedPath | AbsolutePath | RelativePath | NormalizedPath;

declare module "path" {
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
        }
    }

    const path: path.PlatformPath;
    export = path;
}
