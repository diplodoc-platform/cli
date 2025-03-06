import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {LoaderContext} from './loader';
import type {AdditionalInfo, AssetInfo, HeadingInfo, IncludeInfo, Location, Plugin} from './types';

import {join} from 'node:path';
import {uniq} from 'lodash';
import pmap from 'p-map';
import {SourceMap} from '@diplodoc/liquid';

import {Defer, Demand, bounded, fullPath, langFromPath, memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {TransformMode, loader} from './loader';

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
    lint: {
        enabled: boolean;
        config: Hash;
    };
};

type Located = {
    location: Location;
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

    private run: Run;

    private config: MarkdownServiceConfig;

    private plugins: Plugin[] = [];

    private pathToMeta = new Demand<Meta>(this.load);

    private pathToComments = new Demand<[number, number][]>(this.load);

    private pathToDeps = new Demand<IncludeInfo[]>(this.load);

    private pathToAssets = new Demand<AssetInfo[]>(this.load);

    private pathToHeadings = new Demand<HeadingInfo[]>(this.load);

    private pathToInfo = new Demand<AdditionalInfo>(this.load);

    private cache: Hash<Promise<string> | string> = {};

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    @bounded async init() {
        this.plugins = await getHooks(this).Plugins.promise(this.plugins);
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
        const info = this.pathToInfo.get(file) as AdditionalInfo;
        const meta = this.pathToMeta.get(file) as Meta;
        const assets = this.pathToAssets.get(file) as AssetInfo[];

        await getHooks(this).Loaded.promise(raw, meta, file);

        this.run.meta.addMetadata(file, vars.__metadata);
        this.run.meta.addSystemVars(file, vars.__system);
        this.run.meta.add(file, meta);
        // info.meta is filled by plugins, so we can safely add it to resources
        this.run.meta.addResources(file, info.meta);

        defer.resolve(content);

        await getHooks(this).Resolved.promise(raw, info.meta, file);

        await pmap(assets, (asset) => getHooks(this).Asset.promise(asset.path, file));

        return content;
    }

    @bounded async dump(path: RelativePath, markdown: string) {
        const file = normalizePath(path);

        return getHooks(this).Dump.promise(markdown, file);
    }

    @memoize('path')
    async meta(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToMeta.onDemand(file, from);
    }

    @memoize('path')
    async deps(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToDeps.onDemand(file, from, async (deps: IncludeInfo[]) => {
            const active = await this.filterCommented(file, from, deps);
            const internals: IncludeInfo[][] = await pmap(active, async ({path, location}) => {
                const deps = await this.deps(path, [...from, file]);
                return deps.map((dep) => ({...dep, location}));
            });

            return active.concat(...internals);
        });
    }

    @memoize('path')
    async assets(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToAssets.onDemand(file, from, async (assets: AssetInfo[]) => {
            const active = await this.filterCommented(file, from, assets);
            const internals: AssetInfo[][] = await this.mapdeps(file, from, ({path}) => {
                return this.assets(path, [...from, file]);
            });

            return uniq(active.concat(...internals));
        });
    }

    @memoize('path')
    async headings(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToHeadings.onDemand(file, from, async (headings: HeadingInfo[]) => {
            const active = await this.filterCommented(file, from, headings);
            const byLocation = (a: HeadingInfo, b: HeadingInfo) => a.location[0] - b.location[0];
            const internals: HeadingInfo[][] = await this.mapdeps(
                file,
                from,
                async ({path, location}) => {
                    const headings = await this.headings(path, [...from, file]);
                    return headings.map((heading) => ({...heading, location}));
                },
            );

            return active.concat(...internals).sort(byLocation);
        });
    }

    @memoize('path')
    async info(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToInfo.onDemand(file, from);
    }

    private async filterCommented<T extends Located>(
        path: NormalizedPath,
        from: NormalizedPath[],
        items: T[],
    ): Promise<T[]> {
        const comments = await this.pathToComments.onDemand(path, from);
        const contains = (place: Location, point: Location) => {
            return place[0] <= point[0] && place[1] >= point[1];
        };

        return items.filter((item) => {
            return !comments.some((comment) => contains(comment, item.location));
        });
    }

    private async mapdeps<R>(
        file: NormalizedPath,
        from: NormalizedPath[] = [],
        map: (dep: IncludeInfo) => Promise<R>,
    ): Promise<R[]> {
        const deps = await this.deps(file, from);
        return pmap(deps, map);
    }

    private loaderContext(path: NormalizedPath, raw: string, vars: Hash): LoaderContext {
        return {
            root: this.run.input,
            path,
            mode: this.run.config.outputFormat,
            lang: langFromPath(path, this.config),
            vars,
            logger: this.logger,
            readFile: (path: RelativePath) => {
                return this.run.read(join(this.run.input, path));
            },
            emitFile: async (file: NormalizedPath, content: string) => {
                const rootPath = fullPath(file, path);
                await this.run.write(join(this.run.input, rootPath), content);
            },
            markdown: {
                setComments: this.pathToComments.set,
                setDependencies: this.pathToDeps.set,
                setAssets: this.pathToAssets.set,
                setMeta: this.pathToMeta.set,
                setHeadings: this.pathToHeadings.set,
                setInfo: this.pathToInfo.set,
            },
            // @ts-ignore
            plugins: this.plugins,
            sourcemap: new SourceMap(raw),
            settings: {
                substitutions: this.run.config.template.features.substitutions,
                conditions: this.run.config.template.features.conditions,
                conditionsInCode: this.run.config.template.scopes.code,
                keepNotVar: this.run.config.outputFormat === 'md',
            },
            options: {
                rootInput: this.run.originalInput,
                allowHTML: this.run.config.allowHtml,
                needToSanitizeHtml: this.run.config.sanitizeHtml,
                supportGithubAnchors: Boolean(this.run.config.supportGithubAnchors),

                disableLiquid: !this.run.config.template.enabled,

                lintDisabled: !this.run.config.lint.enabled,
                lintConfig: this.run.config.lint.config,
            },
        };
    }
}
