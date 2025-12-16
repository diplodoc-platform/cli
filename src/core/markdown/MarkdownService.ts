import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {LoaderContext, TransformMode} from './loader';
import type {
    AssetInfo,
    Collect,
    EntryGraph,
    EntryInfo,
    GraphInfo,
    HeadingInfo,
    IncludeInfo,
    Location,
    Plugin,
} from './types';

import {dirname, join} from 'node:path';
import {SourceMap} from '@diplodoc/liquid';

import {Buckets, Defer, Graph, VFile, all, bounded, fullPath, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {LoaderAPI, loader} from './loader';
import {parseHeading} from './utils';

type MarkdownServiceConfig = {
    outputFormat: `${TransformMode}`;
    template: {
        enabled: boolean;
        keepNotVar: boolean;
        legacyConditions: boolean;
        features: {
            substitutions: boolean;
            conditions: boolean;
        };
        scopes: {
            code: boolean;
        };
    };
    preprocess?: {
        mergeSvg: boolean;
        mergeIncludes: boolean;
        hashIncludes: boolean;
        mergeAutotitles: boolean;
        transparentMode: boolean;
    };
};

type Run = BaseRun<MarkdownServiceConfig> & {
    meta: MetaService;
    vars: VarsService;
};

type Options = {
    mode: 'build' | 'translate';
};

function hash(path: NormalizedPath, from?: NormalizedPath) {
    return `${path}${from ? '+' + from : ''}`;
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

    private pathToAssets = new Buckets<AssetInfo[]>();

    private pathToHeadings = new Buckets<HeadingInfo[]>();

    private pathToSourcemap = new Buckets<Record<number | string, string>>();

    private cache: Hash<Promise<string> | string> = {};

    private options;

    constructor(run: Run, options: Options = {mode: 'build'}) {
        this.run = run;
        this.options = options;
    }

    @bounded async init() {
        this._collects = await getHooks(this).Collects.promise(this._collects);
        this._plugins = await getHooks(this).Plugins.promise(this._plugins);
    }

    @bounded async load(path: RelativePath, from?: NormalizedPath) {
        const file = normalizePath(path);
        const key = hash(file, from);

        if (key in this.cache) {
            return this.cache[key];
        }

        const defer = new Defer();

        this.cache[key] = defer.promise;

        try {
            const source = normalizePath(join(this.run.input, file)) as AbsolutePath;
            const raw = await this.run.read(source);
            const vars = this.run.vars.for(file, from);

            const context = this.loaderContext(file, raw, vars, this.proxy(key));
            const content = await loader.call(context, raw);

            // At this point all internal states are fully resolved.
            // So we don't expect Defer here.
            const meta = context.api.meta.get() as Meta;

            await getHooks(this).Loaded.promise(raw, meta, file);

            if (this.config.preprocess?.transparentMode) {
                this.run.meta.set(file, meta);
            } else {
                this.run.meta.addMetadata(file, vars.__metadata);
                this.run.meta.addSystemVars(file, vars.__system);
                this.run.meta.add(file, meta);
            }

            this.cache[key] = content;
            defer.resolve(content);

            // TODO: this may trigger uncaught exceptions
            // But if we move this two lines above, then program exits unexpectedly
            await getHooks(this).Resolved.promise(content, file);
        } catch (error) {
            defer.reject(error);
        }

        return defer.promise;
    }

    @bounded async dump(file: NormalizedPath, markdown?: string) {
        const vfile = new VFile<string, EntryInfo>(file, markdown || (await this.load(file)));

        vfile.info = {title: '', headings: []};

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    async meta(path: RelativePath) {
        return this._meta(normalizePath(path));
    }

    async deps(path: RelativePath) {
        return this._deps(normalizePath(path));
    }

    async graph(path: RelativePath) {
        return this._graph(normalizePath(path));
    }

    async relations(path: RelativePath) {
        return this._relations(normalizePath(path));
    }

    async assets(path: RelativePath) {
        return this._assets(normalizePath(path));
    }

    async headings(path: RelativePath) {
        return this._headings(normalizePath(path));
    }

    async titles(path: RelativePath) {
        const file = normalizePath(path);

        const titles: Hash<string> = {};

        try {
            const headings = await this.headings(file);
            const contents = headings.map(({content}) => content);

            for (const content of contents) {
                const {level, title, anchors} = parseHeading(content);

                if (level === 1 && !titles['#']) {
                    titles['#'] = title;
                }

                for (const anchor of anchors) {
                    titles[anchor] = title;
                }
            }
        } catch {
            // This is acceptable.
            // If this is a real file and someone depends on his titles,
            // then we throw exception in md plugin.
        }

        return titles;
    }

    @bounded async inspect(path: RelativePath, raw: string, vars: Hash) {
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

    release(path: NormalizedPath, from?: NormalizedPath) {
        const key = hash(path, from);

        delete this.cache[key];
        this.pathToDeps.delete(key);
        this.pathToMeta.delete(key);
        this.pathToAssets.delete(key);
        this.pathToHeadings.delete(key);
        this.pathToComments.delete(key);
        this.pathToSourcemap.delete(key);
    }

    private async _meta(file: NormalizedPath, from?: NormalizedPath) {
        const key = hash(file, from);

        await this.load(file, from);

        return this.pathToMeta.get(key);
    }

    private async _deps(file: NormalizedPath, from?: NormalizedPath): Promise<IncludeInfo[]> {
        const key = hash(file, from);

        await this.load(file, from);

        const deps = this.pathToDeps.get(key) || [];
        const internals: IncludeInfo[][] = await all(
            (this.pathToDeps.get(key) || []).map(async ({path}) => {
                return this._deps(path, from || file);
            }),
        );

        return deps.concat(...internals);
    }

    private async _graph(path: NormalizedPath, from?: NormalizedPath): Promise<EntryGraph> {
        const key = hash(path, from);

        const content = await this.load(path, from);
        const assets = this.pathToAssets.get(key) || [];
        const deps = await all(
            (this.pathToDeps.get(key) || []).map(async (dep) => {
                return {
                    ...dep,
                    ...(await this._graph(dep.path, from || path)),
                };
            }),
        );

        return {path, content, deps, assets};
    }

    private async _relations(
        path: NormalizedPath,
        from?: NormalizedPath,
    ): Promise<Graph<GraphInfo>> {
        const key = hash(path, from);
        const graph = new Graph<GraphInfo>();

        graph.addNode(path, {type: 'entry'});

        await this.load(path, from);
        await all(
            (this.pathToDeps.get(key) || []).map(async (dep) => {
                graph.consume(await this._relations(dep.path, from || path));
                graph.setNodeData(dep.path, {type: 'source'});
                graph.addDependency(path, dep.path);
            }),
        );

        (this.pathToAssets.get(key) || []).map(async (asset) => {
            if (['image', 'video'].includes(asset.type)) {
                graph.addNode(asset.path);
                graph.setNodeData(asset.path, {type: 'resource'});
                graph.addDependency(path, asset.path);
            }

            if (['link'].includes(asset.type) && asset.autotitle) {
                graph.addNode(asset.path);
                graph.setNodeData(asset.path, {type: 'source'});
                graph.addDependency(path, asset.path);
            }
        });

        const meta = this.run.meta.get(path);
        const resources = ([] as string[]).concat(meta.script || [], meta.style || []);
        for (const resource of resources) {
            const file = normalizePath(join(dirname(path), resource));
            graph.addNode(file);
            graph.setNodeData(file, {type: 'resource'});
            graph.addDependency(path, file);
        }

        return graph;
    }

    private async _assets(file: NormalizedPath, from?: NormalizedPath) {
        const key = hash(file, from);

        await this.load(file, from);

        const assets = this.pathToAssets.get(key) || [];
        const internals: AssetInfo[][] = await all(
            (this.pathToDeps.get(key) || []).map(async ({path}) => {
                return this._assets(path, from || file);
            }),
        );

        return assets.concat(...internals);
    }

    private async _headings(file: NormalizedPath, from?: NormalizedPath) {
        const key = hash(file, from);

        await this.load(file, from);

        const headings = this.pathToHeadings.get(key) || [];
        const internals: HeadingInfo[][] = await all(
            (this.pathToDeps.get(key) || []).map(async ({path, location}) => {
                const headings = await this._headings(path, from || file);
                return headings.map((heading) => ({...heading, location}));
            }),
        );

        return headings.concat(...internals).sort(byLocation);
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
                await this.run.write(join(this.run.input, rootPath), content, true);
            },
            api: new LoaderAPI(api),
            collects: this.collects,
            sourcemap: new SourceMap(raw),
            settings: {
                substitutions: this.config.template.features.substitutions,
                conditions: this.config.template.features.conditions,
                conditionsInCode: this.config.template.scopes.code,
                keepNotVar: this.config.template.keepNotVar,
                legacyConditions: this.config.template.legacyConditions,
            },
            options: {
                disableLiquid: !this.config.template.enabled,
                mergeContentParts: this.config.preprocess?.mergeSvg ?? false,
            },
            mode: this.options.mode,
        };
    }
}
