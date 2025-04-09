import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {LoaderContext} from './loader';
import type {AdditionalInfo, Collect, HeadingInfo, IncludeInfo, Location, Plugin} from './types';

import {join} from 'node:path';
import {uniq} from 'lodash';
import {SourceMap} from '@diplodoc/liquid';

import {Buckets, Defer, all, bounded, fullPath, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {LoaderAPI, TransformMode, loader} from './loader';

export type MarkdownServiceConfig = {
    outputFormat: `${TransformMode}`;
    lang: string;
    langs: string[];
    allowHtml: boolean;
    sanitizeHtml: boolean;
    supportGithubAnchors?: boolean;
    template: {
        enabled: boolean;
        features: {
            substitutions: boolean;
            conditions: boolean;
        };
        scopes: {
            code: boolean;
        };
    };
};

type Run = BaseRun<MarkdownServiceConfig> & {
    meta: MetaService;
    vars: VarsService;
};

function hash(this: MarkdownService, path: NormalizedPath, from: NormalizedPath[] = []) {
    return `${path}+${from[0] || ''}`;
}

const byLocation = (a: HeadingInfo, b: HeadingInfo) => a.location[0] - b.location[0];

@withHooks
export class MarkdownService {
    readonly name = 'Markdown';

    get logger() {
        return this.run.logger;
    }

    get plugins() {
        return this._plugins.slice();
    }

    get collects() {
        return this._collects.slice();
    }

    get config() {
        return this.run.config;
    }

    private run: Run;

    private _collects: Collect[] = [];

    private _plugins: Plugin[] = [];

    private pathToMeta = new Buckets<Meta>();

    private pathToComments = new Buckets<Location[]>();

    private pathToDeps = new Buckets<IncludeInfo[]>();

    private pathToAssets = new Buckets<NormalizedPath[]>();

    private pathToHeadings = new Buckets<HeadingInfo[]>();

    private pathToSourcemap = new Buckets<Record<number | string, string>>();

    private cache: Hash<Promise<string> | string> = {};

    private hash = hash;

    constructor(run: Run) {
        this.run = run;
    }

    @bounded async init() {
        this._collects = await getHooks(this).Collects.promise(this._collects);
        this._plugins = await getHooks(this).Plugins.promise(this._plugins);
    }

    @bounded async load(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const key = this.hash(file, from);

        if (key in this.cache) {
            return this.cache[key];
        }

        const defer = new Defer();

        this.cache[key] = defer.promise;

        try {
            const raw = await this.run.read(join(this.run.input, file));
            const vars = this.run.vars.for(from[0] || file);

            const context = this.loaderContext(file, raw, vars, this.proxy(key));
            const content = await loader.call(context, raw);

            // At this point all internal states are fully resolved.
            // So we don't expect Defer here.
            const meta = context.api.meta.get() as Meta;

            await getHooks(this).Loaded.promise(raw, meta, file, from);

            this.run.meta.addMetadata(file, vars.__metadata);
            this.run.meta.addSystemVars(file, vars.__system);
            this.run.meta.add(file, meta);

            this.cache[key] = content;
            defer.resolve(content);

            // TODO: this may trigger uncaught exceptions
            // But if we move this two lines above, then program exits unexpectedly
            await getHooks(this).Resolved.promise(raw, file, from);
        } catch (error) {
            defer.reject(error);
        }

        return defer.promise;
    }

    @bounded async dump(path: RelativePath, markdown: string) {
        const file = normalizePath(path);

        const info: AdditionalInfo = {title: '', headings: []};
        const result = await getHooks(this).Dump.promise(markdown, file, info);

        return [result, info] as const;
    }

    // @memoize(hash)
    async meta(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const key = this.hash(file, from);

        await this.load(path, from);

        return this.pathToMeta.get(key);
    }

    // This is very buggy!
    // @memoize(hash)
    async deps(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const key = this.hash(file, from);

        await this.load(path, from);

        const deps = this.pathToDeps.get(key) || [];
        const internals: IncludeInfo[][] = await all(
            deps.map(async ({path, location}) => {
                const deps = await this.deps(path, [...from, file]);

                return deps.map((dep) => ({...dep, location}));
            }),
        );

        return deps.concat(...internals);
    }

    // @memoize(hash)
    async assets(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const key = this.hash(file, from);

        await this.load(path, from);

        const assets = this.pathToAssets.get(key) || new Set();
        const deps = (await this.deps(file, from)) || [];
        const internals: NormalizedPath[][] = await all(
            deps.map(async ({path}) => {
                return this.assets(path, [...from, file]);
            }),
        );

        return uniq([...assets].concat(...internals));
    }

    // @memoize(hash)
    async headings(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const key = this.hash(file, from);

        await this.load(path, from);

        const headings = this.pathToHeadings.get(key) || [];
        const deps = (await this.deps(file, from)) || [];
        const internals: HeadingInfo[][] = await all(
            deps.map(async ({path, location}) => {
                const headings = await this.headings(path, [...from, file]);
                return headings.map((heading) => ({...heading, location}));
            }),
        );

        return headings.concat(...internals).sort(byLocation);
    }

    @bounded async analyze(path: RelativePath, raw: string, vars: Hash) {
        const file = normalizePath(path);
        const api = new LoaderAPI();
        const context = this.loaderContext(file, raw, vars, api);
        const content = await loader.call(context, raw);

        const deps = api.deps.get();
        const assets = [...api.assets.get()];

        return {content, deps, assets};
    }

    remap(path: RelativePath, line: number): number {
        const file = normalizePath(path);
        const sourcemap = this.pathToSourcemap.get(file);

        if (!sourcemap) {
            return line;
        }

        return Number(sourcemap[line]) || line;
    }

    private proxy(key: string) {
        return {
            deps: this.pathToDeps.bind(key),
            assets: this.pathToAssets.bind(key),
            meta: this.pathToMeta.bind(key),
            comments: this.pathToComments.bind(key),
            headings: this.pathToHeadings.bind(key),
            sourcemap: this.pathToSourcemap.bind(key),
        };
    }

    private loaderContext(
        path: NormalizedPath,
        raw: string,
        vars: Hash,
        api?: Partial<LoaderAPI>,
    ): LoaderContext {
        return {
            path,
            vars,
            logger: this.logger,
            readFile: (path: RelativePath) => {
                return this.run.read(join(this.run.input, path));
            },
            emitFile: async (file: NormalizedPath, content: string) => {
                const rootPath = fullPath(file, path);
                await this.run.write(join(this.run.input, rootPath), content);
            },
            api: new LoaderAPI(api),
            collects: this.collects,
            sourcemap: new SourceMap(raw),
            settings: {
                substitutions: this.config.template.features.substitutions,
                conditions: this.config.template.features.conditions,
                conditionsInCode: this.config.template.scopes.code,
                keepNotVar: this.config.outputFormat === 'md',
            },
            options: {
                disableLiquid: !this.config.template.enabled,
            },
        };
    }
}
