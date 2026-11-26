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
import {deserialize, serialize} from 'node:v8';
import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {types} from 'node:util';
import {SourceMap} from '@diplodoc/liquid';

import {Buckets, Defer, Graph, VFile, all, bounded, fullPath, normalizePath} from '~/core/utils';

import {LoaderAPI, inspectMarkdown, loader} from './loader';
import {getHooks, withHooks} from './hooks';
import {extractIncludedBlocks} from './included';
import {parseHeading, resolveMarkdownPage} from './utils';

type MarkdownServiceConfig = {
    outputFormat: `${TransformMode}`;
    template: {
        enabled: boolean;
        keepNotVar: boolean;
        legacyConditions: boolean;
        features: {
            substitutions: boolean;
            conditions?: boolean | 'strict';
            cycles?: boolean;
        };
        scopes: {
            code: boolean;
        };
    };
    preprocess?: {
        mergeSvg?: boolean;
        mergeIncludes?: boolean;
        hashIncludes?: boolean;
        mergeAutotitles?: boolean;
    };
};

type Run = BaseRun<MarkdownServiceConfig> & {
    meta: MetaService;
    vars: VarsService;
};

type Options = {
    mode: 'build' | 'translate';
    skipMissingVars: boolean;
};

interface CacheItem {
    content: string;
    varsMetadata?: Hash;
    varsSystem?: Hash;
    meta: Meta;
}

type PackedContext = {
    value: Pick<CacheItem, 'content'>;
    comments: Location[];
    deps: IncludeInfo[];
    codeSources: NormalizedPath[];
    assets: AssetInfo[];
    headings: HeadingInfo[];
};

function canPack(value: unknown, seen = new Set<object>()): boolean {
    if (typeof value !== 'object' || value === null) {
        return typeof value !== 'function' && typeof value !== 'symbol';
    }
    if (types.isProxy(value) || !Object.isExtensible(value)) {
        return false;
    }
    if (seen.has(value)) {
        return true;
    }
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== (array ? Array.prototype : Object.prototype)) {
        return false;
    }
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
        if (array && key === 'length') {
            if (!Object.getOwnPropertyDescriptor(value, key)?.writable) {
                return false;
            }
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
            typeof key !== 'string' ||
            !descriptor ||
            !('value' in descriptor) ||
            !descriptor.enumerable ||
            !descriptor.writable ||
            !descriptor.configurable ||
            !canPack(descriptor.value, seen)
        ) {
            return false;
        }
    }
    return true;
}

function hash(path: NormalizedPath, from?: NormalizedPath) {
    return `${path}${from ? '+' + from : ''}`;
}

function includeBranch(file: NormalizedPath, ancestors: readonly NormalizedPath[]) {
    if (ancestors.includes(file)) {
        throw new Error(`Circular includes: ${[...ancestors, file].join(' ▶ ')}`);
    }

    return [...ancestors, file];
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

    private pathToCodeSources = new Buckets<NormalizedPath[]>();

    private pathToAssets = new Buckets<AssetInfo[]>();

    private pathToHeadings = new Buckets<HeadingInfo[]>();

    private pathToSourcemap = new Buckets<Record<number | string, string>>();

    private cache: Hash<Promise<CacheItem> | CacheItem> = {};

    private readonly contextKeys = new Map<NormalizedPath, Set<string>>();

    private readonly packedContexts = new Map<
        string,
        {
            data: Buffer;
            meta: CacheItem['meta'];
            parsedMeta: Meta;
            varsMetadata: CacheItem['varsMetadata'];
            varsSystem: CacheItem['varsSystem'];
            sourcemap: Record<number | string, string>;
        }
    >();

    private readonly pendingPacking = new Set<NormalizedPath>();

    private readonly contextReaders = new Map<NormalizedPath, number>();

    private _revision = 0;

    /** Changes when a page or an include context is released, including during watch rebuilds. */
    get revision() {
        return this._revision;
    }

    private options;

    constructor(run: Run, options: Options = {mode: 'build', skipMissingVars: false}) {
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

        if (from && this.config.outputFormat !== 'md') {
            const keys = this.contextKeys.get(from) || new Set<string>();
            keys.add(key);
            this.contextKeys.set(from, keys);
        }
        this.restoreCacheKey(key);

        if (key in this.cache) {
            const {content, varsMetadata, varsSystem, meta} = await this.cache[key];
            this.run.meta.addMetadata(file, varsMetadata);
            this.run.meta.addSystemVars(file, varsSystem);
            this.run.meta.add(file, meta, true);
            return content;
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

            this.run.meta.addMetadata(file, vars.__metadata);
            this.run.meta.addSystemVars(file, vars.__system);
            this.run.meta.add(file, meta, true);

            const result = {
                content,
                varsMetadata: vars.__metadata,
                varsSystem: vars.__system,
                meta,
            };
            this.cache[key] = result;
            defer.resolve(result);

            // TODO: this may trigger uncaught exceptions
            // But if we move this two lines above, then program exits unexpectedly
            await getHooks(this).Resolved.promise(content, file);
        } catch (error) {
            const isFileNotFound =
                error instanceof Error && 'code' in error && error.code === 'ENOENT';

            const isMergedInput =
                this.config.outputFormat !== 'md' && this.config.preprocess?.mergeIncludes;
            if (isFileNotFound && from && isMergedInput) {
                // In md2html reading merged output: dep files don't exist on disk,
                // their content is embedded via {% included %} blocks.
                // Resolve with empty content so callers can fall back to embedded data.
                const empty = {
                    content: '',
                    varsMetadata: {} as Hash,
                    varsSystem: {} as Hash,
                    meta: {} as Meta,
                };
                this.cache[key] = empty;
                this.pathToDeps.set(key, []);
                defer.resolve(empty);
            } else {
                defer.reject(error);
            }
        }

        return (await defer.promise).content;
    }

    @bounded async dump(file: NormalizedPath, markdown?: string) {
        const vfile = new VFile<string, EntryInfo>(file, markdown || (await this.load(file)));

        vfile.info = {title: '', headings: []};

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    async meta(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._meta(file), false);
    }

    async deps(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._deps(file), false);
    }

    /** Resolves includes for either a complete article or an embedded Markdown field. */
    async expandIncludes(
        deps: IncludeInfo[],
        from: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ): Promise<IncludeInfo[]> {
        const internals: IncludeInfo[][] = await all(
            deps.map(async ({path}) => {
                try {
                    return await this._deps(path, from, ancestors);
                } catch (error) {
                    const isMergedInput =
                        this.config.outputFormat !== 'md' && this.config.preprocess?.mergeIncludes;
                    const isFileNotFound =
                        error instanceof Error && 'code' in error && error.code === 'ENOENT';
                    if (isMergedInput && isFileNotFound) {
                        return [];
                    }
                    throw error;
                }
            }),
        );

        return deps.concat(...internals);
    }

    async graph(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._graph(file), false);
    }

    async relations(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._relations(file), false);
    }

    async assets(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._assets(file), false);
    }

    async headings(path: RelativePath) {
        const file = normalizePath(path);
        return this.withContext(file, () => this._headings(file), false);
    }

    async titles(path: RelativePath) {
        return this.withContext(normalizePath(path), () => this._titles(path), false);
    }

    @bounded async inspect(path: RelativePath, raw: string, vars: Hash) {
        const file = normalizePath(path);
        const api = new LoaderAPI();
        const context = this.loaderContext(file, raw, vars, api);
        const content = await loader.call(context, raw);

        const deps = api.deps.get();
        const assets = [...api.assets.get(), ...this.embeddedAssets(file, content)];

        return {content, deps, assets};
    }

    remap(path: RelativePath, line: number): number {
        const file = normalizePath(path);
        this.restoreCacheKey(hash(file));
        const sourcemap = this.pathToSourcemap.get(file);

        if (!sourcemap) {
            return line;
        }

        return Number(sourcemap[line]) || line;
    }

    release(path: NormalizedPath, from?: NormalizedPath) {
        const key = hash(path, from);

        this._revision++;
        if (from) {
            const keys = this.contextKeys.get(from);
            keys?.delete(key);
            if (!keys?.size) {
                this.contextKeys.delete(from);
            }
        }
        this.clearCacheKey(key);
    }

    /** Pack completed page/include data only after the last reader has finished. */
    async withContext<T>(file: NormalizedPath, read: () => Promise<T>, compact = true): Promise<T> {
        if (this.config.outputFormat === 'md') {
            return read();
        }
        if (compact) {
            this.pendingPacking.add(file);
        }
        this.contextReaders.set(file, (this.contextReaders.get(file) || 0) + 1);
        try {
            return await read();
        } finally {
            const readers = (this.contextReaders.get(file) as number) - 1;
            if (readers) {
                this.contextReaders.set(file, readers);
            } else {
                this.contextReaders.delete(file);
                if (this.pendingPacking.delete(file)) {
                    this.packContext(hash(file));
                    for (const key of this.contextKeys.get(file) || []) {
                        this.packContext(key);
                    }
                    this.contextKeys.delete(file);
                }
            }
        }
    }

    /** Returns assets from reachable embedded sources using each source's own logical path. */
    embeddedAssets(file: NormalizedPath, content: string, deps: IncludeInfo[] = []): AssetInfo[] {
        const {content: cleanContent, files} = extractIncludedBlocks(content, file);
        if (!Object.keys(files).length) {
            return [];
        }

        const assets: AssetInfo[] = [];
        const seen = new Set<NormalizedPath>();
        const context = this.loaderContext(file, cleanContent, {});
        const roots = inspectMarkdown.call(context, cleanContent).deps;
        const visit = ({path}: IncludeInfo) => {
            if (seen.has(path) || typeof files[path] !== 'string') {
                return;
            }
            seen.add(path);

            const body = files[path];
            const context = this.loaderContext(path, body, {});
            const inspected = inspectMarkdown.call(context, body);
            assets.push(...inspected.assets);
            inspected.deps.forEach(visit);
        };

        [...roots, ...deps].forEach(visit);

        return assets;
    }

    private async _titles(path: RelativePath) {
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
            // The Markdown plugin reports missing titles when the link is used.
        }

        return titles;
    }

    private restoreCacheKey(key: string) {
        const packed = this.packedContexts.get(key);
        if (packed) {
            const context = deserialize(inflateRawSync(packed.data)) as PackedContext;
            this.cache[key] = {
                ...context.value,
                meta: packed.meta,
                varsMetadata: packed.varsMetadata,
                varsSystem: packed.varsSystem,
            };
            this.pathToMeta.set(key, packed.parsedMeta);
            this.pathToComments.set(key, context.comments);
            this.pathToDeps.set(key, context.deps);
            this.pathToCodeSources.set(key, context.codeSources);
            this.pathToAssets.set(key, context.assets);
            this.pathToHeadings.set(key, context.headings);
            this.pathToSourcemap.set(key, packed.sourcemap);
            this.packedContexts.delete(key);
        }
    }

    private packContext(key: string) {
        const value = this.cache[key];
        if (!value || value instanceof Promise) {
            return;
        }
        const context: PackedContext = {
            value: {content: value.content},
            comments: this.pathToComments.get(key),
            deps: this.pathToDeps.get(key),
            codeSources: this.pathToCodeSources.get(key),
            assets: this.pathToAssets.get(key),
            headings: this.pathToHeadings.get(key),
        };
        let packed: Buffer;
        try {
            if (!canPack(context)) {
                return;
            }
            // Avoid retaining zlib chunks through shared Buffer slabs.
            const compressed = deflateRawSync(serialize(context), {level: 1});
            packed = Buffer.alloc(compressed.length);
            compressed.copy(packed);
        } catch {
            // Plugin-provided parsed data may contain values V8 cannot serialize.
            return;
        }
        const sourcemap = this.pathToSourcemap.get(key);
        const parsedMeta = this.pathToMeta.get(key);
        this.clearCacheKey(key);
        // Keep metadata shared with plugins, tracked variables and lazy source maps by reference.
        this.packedContexts.set(key, {
            data: packed,
            meta: value.meta,
            parsedMeta,
            varsMetadata: value.varsMetadata,
            varsSystem: value.varsSystem,
            sourcemap,
        });
    }

    private clearCacheKey(key: string) {
        this.packedContexts.delete(key);
        delete this.cache[key];
        this.pathToDeps.delete(key);
        this.pathToCodeSources.delete(key);
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

    private async _deps(
        file: NormalizedPath,
        from?: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ): Promise<IncludeInfo[]> {
        const branch = includeBranch(file, ancestors);
        const key = hash(file, from);

        await this.load(file, from);

        return this.expandIncludes(this.pathToDeps.get(key) || [], from || file, branch);
    }

    private async _graph(
        path: NormalizedPath,
        from?: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ): Promise<EntryGraph> {
        const branch = includeBranch(path, ancestors);
        const key = hash(path, from);

        const content = await this.load(path, from);
        const assets = this.pathToAssets.get(key) || [];
        const deps = await all(
            (this.pathToDeps.get(key) || []).map(async (dep) => {
                return {
                    ...dep,
                    ...(await this._graph(dep.path, from || path, branch)),
                };
            }),
        );

        return {path, content, deps, assets};
    }

    private async _relations(
        path: NormalizedPath,
        from?: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ): Promise<Graph<GraphInfo>> {
        const branch = includeBranch(path, ancestors);
        const key = hash(path, from);
        const graph = new Graph<GraphInfo>();

        graph.addNode(path, {type: 'entry'});

        const content = await this.load(path, from);
        const embedded = content.includes('included')
            ? this.embeddedAssets(path, content, await this._deps(path, from))
            : [];
        const assets = (this.pathToAssets.get(key) || []).concat(embedded);

        await all(
            (this.pathToDeps.get(key) || []).map(async (dep) => {
                graph.consume(await this._relations(dep.path, from || path, branch));
                graph.setNodeData(dep.path, {type: 'source'});
                graph.addDependency(path, dep.path);
            }),
        );

        for (const source of this.pathToCodeSources.get(key) || []) {
            if (source === path) {
                continue;
            }
            graph.addNode(source, {type: 'source'});
            graph.addDependency(path, source);
        }

        assets.forEach((asset) => {
            if (['image', 'video'].includes(asset.type)) {
                graph.addNode(asset.path);
                graph.setNodeData(asset.path, {type: 'resource'});
                graph.addDependency(path, asset.path);
            }

            if (
                (asset.type === 'link' || asset.type === 'def') &&
                (asset.autotitle || asset.hash) &&
                asset.path
            ) {
                const target =
                    asset.type === 'def' || asset.hash
                        ? resolveMarkdownPage(asset.path, (candidate) =>
                              this.run.exists(
                                  normalizePath(join(this.run.input, candidate)) as AbsolutePath,
                              ),
                          )
                        : asset.path;
                if (target && target !== path) {
                    graph.addNode(target);
                    graph.setNodeData(target, {type: 'source'});
                    graph.addDependency(path, target);
                }
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

    private async _assets(
        file: NormalizedPath,
        from?: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ) {
        const branch = includeBranch(file, ancestors);
        const key = hash(file, from);

        const content = await this.load(file, from);

        const assets = this.pathToAssets.get(key) || [];
        const internals: AssetInfo[][] = await all(
            (this.pathToDeps.get(key) || []).map(async ({path}) => {
                return this._assets(path, from || file, branch);
            }),
        );

        const embeddedDeps = content.includes('included') ? await this._deps(file, from) : [];

        return assets.concat(...internals, this.embeddedAssets(file, content, embeddedDeps));
    }

    private async _headings(
        file: NormalizedPath,
        from?: NormalizedPath,
        ancestors: readonly NormalizedPath[] = [],
    ) {
        const branch = includeBranch(file, ancestors);
        const key = hash(file, from);

        await this.load(file, from);

        const headings = this.pathToHeadings.get(key) || [];
        const internals: HeadingInfo[][] = await all(
            (this.pathToDeps.get(key) || []).map(async ({path, location}) => {
                const headings = await this._headings(path, from || file, branch);
                return headings.map((heading) => ({...heading, location}));
            }),
        );

        return headings.concat(...internals).sort(byLocation);
    }

    private proxy(key: string) {
        return {
            deps: this.pathToDeps.bind(key),
            codeSources: this.pathToCodeSources.bind(key),
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
            fullPath: (path: RelativePath) => join(this.run.input, path),
            input: this.run.input,
            api: new LoaderAPI(api),
            collects: this.collects,
            sourcemap: new SourceMap(raw),
            settings: {
                substitutions: this.config.template.features.substitutions,
                conditions:
                    typeof this.config.template.features.conditions === 'string'
                        ? (this.config.template.features.conditions as 'strict')
                        : Boolean(this.config.template.features.conditions),
                cycles: this.config.template.features.cycles ?? true,
                conditionsInCode: this.config.template.scopes.code,
                keepNotVar: this.config.template.keepNotVar,
                legacyConditions: this.config.template.legacyConditions,
                keepConditionSyntaxOnTrue: this.options.mode === 'translate',
            },
            options: {
                disableLiquid: !this.config.template.enabled,
                mergeContentParts: this.config.preprocess?.mergeSvg ?? false,
                skipMissingVars: this.options.skipMissingVars,
            },
            mode: this.options.mode,
        };
    }
}
