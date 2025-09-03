import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {VcsService} from '~/core/vcs';

import type {AssetInfo, LeadingPage, Plugin, RawLeadingPage} from './types';
import type {LoaderContext} from './loader';

import {join} from 'node:path';
import {dump, load} from 'js-yaml';

import {Buckets, Defer, VFile, bounded, fullPath, langFromPath, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {LoaderAPI, loader} from './loader';
import {walkLinks} from './utils';

type Run = BaseRun<LeadingServiceConfig> & {
    vars: VarsService;
    meta: MetaService;
    vcs: VcsService;
};

export type LeadingServiceConfig = {
    lang: string;
    langs: string[];
    template: {
        enabled: boolean;
        features: {
            conditions: boolean;
            substitutions: boolean;
        };
    };
};

@withHooks
export class LeadingService {
    readonly name = 'Leading';

    get logger() {
        return this.run.logger;
    }

    private run: Run;

    private config: LeadingServiceConfig;

    private cache: Hash<Promise<LeadingPage> | LeadingPage> = {};

    private plugins: Plugin[] = [];

    private pathToMeta = new Buckets<Meta>();

    private pathToDeps = new Buckets<never[]>();

    private pathToAssets = new Buckets<AssetInfo[]>();

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    @bounded async init() {
        this.plugins = await getHooks(this).Plugins.promise(this.plugins);
    }

    @bounded async load(path: RelativePath): Promise<LeadingPage> {
        const file = normalizePath(path);

        if (file in this.cache) {
            return this.cache[file];
        }

        const defer = new Defer();

        this.cache[file] = defer.promise;

        try {
            const source = normalizePath(join(this.run.input, file)) as AbsolutePath;
            const raw = await this.run.read(source);
            const vars = this.run.vars.for(path);
            const yaml = load(raw || '{}') as RawLeadingPage;

            const context = this.loaderContext(file, raw, vars, this.proxy(file));
            const leading = await loader.call(context, yaml);

            const meta = this.pathToMeta.get(file);

            await getHooks(this).Loaded.promise(leading, meta, file);

            this.run.meta.addMetadata(path, vars.__metadata);
            // TODO: Move to SystemVars feature
            this.run.meta.addSystemVars(path, vars.__system);
            this.run.meta.add(file, meta);
            // leading.meta is filled by plugins, so we can safely add it to resources
            this.run.meta.addResources(file, leading.meta);

            this.cache[file] = leading;
            defer.resolve(leading);

            await getHooks(this).Resolved.promise(leading, meta, file);
        } catch (error) {
            defer.reject(error);
        }

        return defer.promise;
    }

    @bounded async dump(path: RelativePath, leading?: LeadingPage): Promise<VFile<LeadingPage>> {
        const vfile = new VFile(path, leading || (await this.load(path)), dump);

        await getHooks(this).Dump.promise(vfile);

        return vfile;
    }

    @bounded walkLinks(leading: LeadingPage | undefined, walker: (link: string) => string | void) {
        if (!leading) {
            return undefined;
        }

        return walkLinks(leading, walker);
    }

    async deps(path: RelativePath) {
        const file = normalizePath(path);

        return this.pathToDeps.get(file);
    }

    async assets(path: RelativePath) {
        const file = normalizePath(path);

        return [...this.pathToAssets.get(file)];
    }

    private proxy(key: string) {
        return {
            deps: this.pathToDeps.bind(key),
            assets: this.pathToAssets.bind(key),
            meta: this.pathToMeta.bind(key),
        };
    }

    private loaderContext(
        path: NormalizedPath,
        _raw: string,
        vars: Hash,
        api: Partial<LoaderAPI>,
    ): LoaderContext {
        return {
            path,
            vars,
            lang: langFromPath(path, this.config),
            readFile: (path: RelativePath) => {
                return this.run.read(join(this.run.input, path));
            },
            emitFile: async (file: NormalizedPath, content: string) => {
                const rootPath = fullPath(file, path);
                await this.run.write(join(this.run.input, rootPath), content);
            },
            plugins: [...this.plugins],
            logger: this.logger,
            api: new LoaderAPI(api),
            options: {
                disableLiquid: !this.run.config.template.enabled,
            },
            settings: {
                substitutions: this.config.template.features.conditions,
                conditions: this.config.template.features.substitutions,
            },
        };
    }
}
