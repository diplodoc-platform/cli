import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {LoaderContext} from './loader';
import type {AdditionalInfo, AssetInfo, HeadingInfo, IncludeInfo, Plugin} from './types';

import {dirname, join} from 'node:path';
import {uniq} from 'lodash';
import pmap from 'p-map';
import {SourceMap} from '@diplodoc/liquid';

import {Defer, bounded, langFromPath, memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {TransformMode, loader} from './loader';
import {Demand} from './utils';

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

        if (this.cache[file]) {
            return this.cache[file];
        }

        const defer = new Defer();

        this.cache[file] = defer.promise;

        defer.promise.then((result) => {
            this.cache[file] = result;
        });

        const raw = await this.run.read(join(this.run.input, file));
        const vars = await this.run.vars.load(file);

        const context = this.loaderContext(this.run, file, raw, vars);
        const content = await loader.call(context, raw);

        // At this point all internal states are fully resolved.
        // So we don't expect Defer here.
        const meta = this.pathToMeta.get(file) as Meta;
        const assets = this.pathToAssets.get(file) as AssetInfo[];

        this.run.meta.addMetadata(path, vars.__metadata);
        this.run.meta.addSystemVars(path, vars.__system);
        this.run.meta.add(file, meta);

        await getHooks(this).Loaded.promise(raw, meta, file);

        defer.resolve(content);

        await getHooks(this).Resolved.promise(raw, meta, file);

        await pmap(assets, (asset) => getHooks(this).Asset.promise(file, asset.path));

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
            const internals: IncludeInfo[][] = await pmap(deps, async ({path, location}) => {
                const deps = await this.deps(path, [...from, file]);
                return deps.map((dep) => ({...dep, location}));
            });

            return deps.concat(...internals);
        });
    }

    @memoize('path')
    async assets(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToAssets.onDemand(file, from, async (assets: AssetInfo[]) => {
            const internals: AssetInfo[][] = await this.mapdeps(file, from, ({path}) => {
                return this.assets(path, [...from, file]);
            });

            return uniq(assets.concat(...internals));
        });
    }

    @memoize('path')
    async headings(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToHeadings.onDemand(file, from, async (headings: HeadingInfo[]) => {
            const byLocation = (a: HeadingInfo, b: HeadingInfo) =>
                a.location.start - b.location.start;
            const internals: HeadingInfo[][] = await this.mapdeps(
                file,
                from,
                async ({path, location}) => {
                    const headings = await this.headings(path, [...from, file]);
                    return headings.map((heading) => ({...heading, location}));
                },
            );

            return headings.concat(...internals).sort(byLocation);
        });
    }

    @memoize('path')
    async info(path: RelativePath, from: NormalizedPath[] = []) {
        const file = normalizePath(path);

        return this.pathToInfo.onDemand(file, from);
    }

    private async mapdeps<R>(
        file: NormalizedPath,
        from: NormalizedPath[] = [],
        map: (dep: IncludeInfo) => Promise<R>,
    ): Promise<R[]> {
        const deps = await this.deps(file, from);
        return pmap(deps, map);
    }

    private loaderContext(run: Run, path: NormalizedPath, raw: string, vars: Hash): LoaderContext {
        return {
            root: run.input,
            path,
            mode: run.config.outputFormat,
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
                setDependencies: this.pathToDeps.set,
                setAssets: this.pathToAssets.set,
                setMeta: this.pathToMeta.set,
                setHeadings: this.pathToHeadings.set,
                setInfo: this.pathToInfo.set,
            },
            plugins: this.plugins,
            sourcemap: new SourceMap(raw),
            settings: {
                substitutions: run.config.template.features.substitutions,
                conditions: run.config.template.features.conditions,
                conditionsInCode: run.config.template.scopes.code,
                keepNotVar: run.config.outputFormat === 'md',
            },
            options: {
                rootInput: run.originalInput,
                allowHTML: run.config.allowHtml,
                needToSanitizeHtml: run.config.sanitizeHtml,
                supportGithubAnchors: Boolean(run.config.supportGithubAnchors),

                disableLiquid: !run.config.template.enabled,

                lintDisabled: !run.config.lint.enabled,
                lintConfig: run.config.lint.config,
            },
        };
    }
}

function fullPath(path: AbsolutePath | NormalizedPath, root: NormalizedPath): NormalizedPath {
    if (path.match(/^(\/|\\)/)) {
        return normalizePath(path.slice(1));
    } else {
        return normalizePath(join(dirname(root), path));
    }
}
