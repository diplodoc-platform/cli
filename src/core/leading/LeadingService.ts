import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {Meta, MetaService} from '~/core/meta';
import type {VcsService} from '~/core/vcs';

import type {AssetInfo, LeadingPage, Plugin, RawLeadingPage} from './types';
import type {LoaderContext} from './loader';

import {join} from 'node:path';
import pmap from 'p-map';
import {load} from 'js-yaml';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {Defer, Demand, bounded, fullPath, langFromPath, memoize, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {loader} from './loader';
import {modifyValuesByKeys} from './utils';

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

    private pathToMeta = new Demand<Meta>(this.load);

    private pathToDeps = new Demand<never[]>(this.load);

    private pathToAssets = new Demand<AssetInfo[]>(this.load);

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

        defer.promise.then((result) => {
            this.cache[file] = result;
        });

        const raw = await this.run.read(join(this.run.input, file));
        const vars = this.run.vars.for(path);
        const yaml = load(raw) as RawLeadingPage;

        const context = this.loaderContext(file, raw, vars);
        const leading = await loader.call(context, yaml);

        const meta = this.pathToMeta.get(file);
        const assets = this.pathToAssets.get(file);

        await getHooks(this).Loaded.promise(leading, meta, file);

        this.run.meta.addMetadata(path, vars.__metadata);
        // TODO: Move to SystemVars feature
        this.run.meta.addSystemVars(path, vars.__system);
        this.run.meta.add(file, meta);
        // leading.meta is filled by plugins, so we can safely add it to resources
        this.run.meta.addResources(file, leading.meta);

        defer.resolve(leading);

        await getHooks(this).Resolved.promise(leading, meta, file);

        await pmap(assets, (asset) => getHooks(this).Asset.promise(asset.path, file));

        return leading;
    }

    @bounded async dump(path: RelativePath, leading: LeadingPage): Promise<LeadingPage> {
        const file = normalizePath(path);

        leading.meta = await this.run.meta.dump(file);

        return getHooks(this).Dump.promise(leading, file);
    }

    @bounded walkLinks(leading: LeadingPage | undefined, walker: (link: string) => string) {
        if (!leading) {
            return undefined;
        }

        return modifyValuesByKeys(leading, LINK_KEYS, walker);
    }

    @memoize('path')
    async deps(path: RelativePath) {
        const file = normalizePath(path);

        return this.pathToDeps.get(file);
    }

    @memoize('path')
    async assets(path: RelativePath) {
        const file = normalizePath(path);

        return this.pathToAssets.get(file);
    }

    private loaderContext(path: NormalizedPath, _raw: string, vars: Hash): LoaderContext {
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
            leading: {
                setDependencies: this.pathToDeps.set,
                setAssets: this.pathToAssets.set,
                setMeta: this.pathToMeta.set,
            },
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
