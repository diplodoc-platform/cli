import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {LoaderContext} from './loader';
import type {AdditionalInfo, AssetInfo, Collect, HeadingInfo, IncludeInfo, Plugin} from './types';

import {join} from 'node:path';
import {uniq} from 'lodash';
import pmap from 'p-map';
import {SourceMap} from '@diplodoc/liquid';

import {Defer, Demand, bounded, fullPath, memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {LoaderAPI, TransformMode, loader} from './loader';

type MarkdownServiceConfig = {
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

    private run: Run;

    private config: MarkdownServiceConfig;

    private _collects: Collect[] = [];

    private _plugins: Plugin[] = [];

    private pathToMeta = new Demand<Meta>(this.load);

    private pathToComments = new Demand<[number, number][]>(this.load);

    private pathToDeps = new Demand<IncludeInfo[]>(this.load);

    private pathToAssets = new Demand<AssetInfo[]>(this.load);

    private pathToHeadings = new Demand<HeadingInfo[]>(this.load);

    private pathToSourcemap = new Demand<Record<number | string, string>>(this.load);

    private cache: Hash<Promise<string> | string> = {};

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    @bounded async init() {
        this._collects = await getHooks(this).Collects.promise(this._collects);
        this._plugins = await getHooks(this).Plugins.promise(this._plugins);
    }

    @bounded async load(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        if (from.includes(file)) {
            throw new Error('Circular dependency detected:\n\t->' + from.join('\n\t->'));
        }

        if (file in this.cache) {
            return this.cache[file];
        }

        const defer = new Defer();

        this.cache[file] = defer.promise;

        defer.promise.then((result) => {
            this.cache[file] = result;
        });

        const raw = await this.run.read(join(this.run.input, file));
        const vars = this.run.vars.for(from[0] || file);

        const context = this.loaderContext(file, raw, vars);
        const content = await loader.call(context, raw);

        // At this point all internal states are fully resolved.
        // So we don't expect Defer here.
        const meta = this.pathToMeta.get(file) as Meta;
        const assets = this.pathToAssets.get(file) as AssetInfo[];

        await getHooks(this).Loaded.promise(raw, meta, file);

        this.run.meta.addMetadata(file, vars.__metadata);
        this.run.meta.addSystemVars(file, vars.__system);
        this.run.meta.add(file, meta);

        defer.resolve(content);

        await getHooks(this).Resolved.promise(raw, file);

        await pmap(assets, (asset) => getHooks(this).Asset.promise(asset.path, file));

        return content;
    }

    @bounded async dump(path: RelativePath, markdown: string) {
        const file = normalizePath(path);

        const info: AdditionalInfo = {title: '', headings: []};
        const result = await getHooks(this).Dump.promise(markdown, file, info);

        return [result, info] as const;
    }

    @memoize('path')
    async meta(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToMeta.onDemand(file, from);
    }

    @memoize('path')
    async deps(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        const deps = await this.pathToDeps.onDemand(file, from);
        const internals: IncludeInfo[][] = await pmap(deps, async ({path, location}) => {
            const deps = await this.deps(path, [...from, file]);
            return deps.map((dep) => ({...dep, location}));
        });

        return deps.concat(...internals);
    }

    @memoize('path')
    async assets(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        const assets = await this.pathToAssets.onDemand(file, from);
        const internals: AssetInfo[][] = await this.mapdeps(file, from, ({path}) => {
            return this.assets(path, [...from, file]);
        });

        return uniq(assets.concat(...internals));
    }

    @memoize('path')
    async headings(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);
        const byLocation = (a: HeadingInfo, b: HeadingInfo) => a.location[0] - b.location[0];

        const headings = await this.pathToHeadings.onDemand(file, from);
        const internals: HeadingInfo[][] = await this.mapdeps(
            file,
            from,
            async ({path, location}) => {
                const headings = await this.headings(path, [...from, file]);
                return headings.map((heading) => ({...heading, location}));
            },
        );

        return headings.concat(...internals).sort(byLocation);
    }

    @bounded async analyze(path: RelativePath, raw: string, vars: Hash) {
        const file = normalizePath(path);
        const api = new LoaderAPI();
        const context = this.loaderContext(file, raw, vars, api);
        const content = await loader.call(context, raw);

        const deps = api.deps.get();
        const assets = api.assets.get();

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

    private async mapdeps<R>(
        file: NormalizedPath,
        from: NormalizedPath[] = [],
        map: (dep: IncludeInfo) => Promise<R>,
    ): Promise<R[]> {
        const deps = await this.deps(file, from);
        return pmap(deps, map);
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
            api: new LoaderAPI(
                api || {
                    deps: this.pathToDeps.proxy(path),
                    assets: this.pathToAssets.proxy(path),
                    meta: this.pathToMeta.proxy(path),
                    comments: this.pathToComments.proxy(path),
                    headings: this.pathToHeadings.proxy(path),
                    sourcemap: this.pathToSourcemap.proxy(path),
                },
            ),
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
