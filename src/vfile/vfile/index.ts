import type { LoaderData, LoaderOptions } from '../loader-runner';

import {resolve} from 'node:path';
import {readFile, stat} from 'node:fs/promises';
import vfile, { VFile as BaseVFile, VFileOptions as VFileBaseOptions } from 'vfile';

import { parsePathQueryFragment } from '../loader-runner/utils';
import { ExtendedContext } from './ExtendedContext';
import { resolveLoaders } from './resolveLoaders';
import { runLoaders } from '../loader-runner';

interface VFileConstructor {
    new(...args: Parameters<BaseVFile>): BaseVFile;
}

export interface MinimalFileSystem {
    readFile: typeof readFile;
    stat: typeof stat;
}

export interface VFileOptions extends VFileBaseOptions {
    request: string;
    issuer?: VFile<unknown>;
    fs?: MinimalFileSystem;
    loaders?: (string | LoaderOptions)[];
}

export class VFile<T = string> extends (vfile as (BaseVFile & VFileConstructor)) {

    readonly issuer: VFile<unknown> | undefined;

    readonly fs = {readFile, stat};

    readonly module = new NormalModule();

    readonly loaders: (string | LoaderOptions)[] = [];

    readonly assets: Map<string, { name: string; content: string | Buffer }> = new Map();

    readonly meta: Hash = {};

    readonly path: string = '';

    readonly query: string = '';

    readonly fragment: string = '';

    map: SourceMap | undefined;

    private processed: T | null = null;

    private resolvedLoaders: LoaderData[] | null = null;

    constructor(options: VFileOptions) {
        // eslint-disable-next-line constructor-super
        super({ ...options, ...parsePathQueryFragment(options.request) });

        this.issuer = options.issuer;

        if ('request' in options) {
            this.request = options.request;
        }

        if (typeof options === 'object' && 'fs' in options) {
            this.fs = options.fs || this.fs;
        }

        if (typeof options === 'object' && 'loaders' in options) {
            this.loaders = options.loaders || this.loaders;
        }
    }

    get request(): string {
        return (this.path as string).replace(/#/g, '\0#') + this.query.replace(/#/g, '\0#') + this.fragment;
    }

    set request(value: string) {
        const { path, query, fragment } = parsePathQueryFragment(value);

        Object.assign(this, { path, query, fragment });
    }

    from(options: VFileOptions): VFile<T> {
        const file = new VFile<T>(options);

        if (!options.loaders) {
            const loaders = Object.getOwnPropertyDescriptor(this, 'loaders') as PropertyDescriptor;
            Object.defineProperty(file, 'loaders', loaders);
        }

        if (!options.fs) {
            const fs = Object.getOwnPropertyDescriptor(this, 'fs') as PropertyDescriptor;
            Object.defineProperty(file, 'fs', fs);
        }

        return file;
    }

    async load() {
        this.contents = this.contents || await this.fs.readFile(this.path, 'utf8');

        return this.contents;
    }

    async process(): Promise<T> {
        if (this.processed !== null) {
            return this.processed;
        }

        const content = await this.load();
        const loaders = this.resolvedLoaders = this.resolvedLoaders || await resolveLoaders(this.loaders);
        const context = new ExtendedContext(this, loaders);

        const [ error, result ] = await runLoaders({
            resource: resolve(this.cwd, this.request),

            loaders: loaders,

            context: context,

            readResource(_path, callback) {
                callback(null, content as string);
            }
        });

        this.meta.fileDependencies = [...new Set(result.fileDependencies)];
        this.meta.missingDependencies = [...new Set(result.missingDependencies)];

        if (result.result) {
            const [ source, map, meta ] = result.result;

            if (typeof meta === 'object') {
                Object.keys(meta).forEach(key => {
                    this.meta[key] = meta[key];
                });
            }

            this.map = map;
            this.processed = source as T;

            return this.processed;
        } else {
            throw error;
        }
    }
}

export class NormalModule {
}
