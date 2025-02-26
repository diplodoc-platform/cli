declare const __dirname: AbsolutePath;
declare const require: Require;
declare const VERSION: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Hash<T = any> = Record<string, T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassType<T = any> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (...args: any[]): T;
};

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends {} ? DeepPartial<T[P]> : T[P];
};

type DeepFrozen<T> = {
    readonly [P in keyof T]: T[P] extends {} ? DeepFrozen<T[P]> : T[P];
};

type URIString = string & {
    __type: 'uri';
    __mode: 'relative';
    __fix: 'normalized';
};

type Require = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (id: string): any;
    resolve(id: string, options?: {paths?: string[] | undefined}): AbsolutePath;
    main: NodeJS.Module | undefined;
};

declare module 'node:fs/promises' {
    import {EncodingOption} from 'node:fs';

    export function readFile(path: AbsolutePath, options: EncodingOption): Promise<string>;

    export function realpath(
        path: AbsolutePath,
        options?: EncodingOption | null,
    ): Promise<AbsolutePath>;
}

interface Error {
    code?: string;
}
