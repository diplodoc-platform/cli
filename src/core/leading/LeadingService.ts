import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService} from '~/core/meta';
import type {VcsService} from '~/core/vcs';
import type {LeadingPage, Plugin, RawLeadingPage} from './types';
import type {LoaderContext} from './loader';

import {join} from 'node:path';
import {cloneDeepWith, isString} from 'lodash';
import {load} from 'js-yaml';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {bounded, freezeJson, isRelativePath, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {loader} from './loader';

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

    private run: Run;

    private config: LeadingServiceConfig;

    private cached: Hash<LeadingPage> = {};

    private plugins: Plugin[] = [];

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    @bounded async init() {
        this.plugins = await getHooks(this).Plugins.promise(this.plugins);
    }

    @bounded async load(path: RelativePath): Promise<LeadingPage> {
        const file = normalizePath(path);

        if (this.cached[file]) {
            return this.cached[file];
        }

        const raw = await this.run.read(join(this.run.input, file));
        const yaml = load(raw) as RawLeadingPage;

        const context = await this.loaderContext(file);
        const leading = await loader.call(context, yaml);

        this.run.meta.addMetadata(path, context.vars.__metadata);
        this.run.meta.addSystemVars(path, context.vars.__system);
        const meta = this.run.meta.add(file, leading.meta || {});
        this.run.meta.add(path, await this.run.vcs.metadata(file, meta));

        delete leading.meta;

        await getHooks(this).Resolved.promise(freezeJson(leading), file);

        const assets = new Set<RelativePath>();
        this.walkLinks(leading, (link) => {
            if (link && isRelativePath(link)) {
                assets.add(link);
            }

            return link;
        });

        // TODO: concurrently
        for (const asset of assets) {
            await getHooks(this).Asset.promise(join(file, asset), file);
        }

        this.cached[file] = leading;

        return leading;
    }

    @bounded async dump<T extends object = object>(path: RelativePath): Promise<T> {
        const file = normalizePath(path);
        const leading = await this.load(file);

        leading.meta = await this.run.meta.dump(file);

        return getHooks(this).Dump.promise(leading, file) as T;
    }

    @bounded walkLinks(leading: LeadingPage | undefined, walker: (link: string) => string) {
        if (!leading) {
            return undefined;
        }

        return modifyValuesByKeys(leading, LINK_KEYS, walker);
    }

    private async loaderContext(path: NormalizedPath): Promise<LoaderContext> {
        const {lang, langs} = this.config;
        const pathBaseLang = path.split('/')[0];
        const pathLang = langs.includes(pathBaseLang) && pathBaseLang;

        const vars = await this.run.vars.load(path);

        return {
            path,
            vars,
            lang: pathLang || lang || langs[0],
            plugins: [...this.plugins],
            options: {
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
            },
        };
    }
}

function modifyValuesByKeys(object: object, keys: string[], modify: (value: string) => string) {
    // Clone the object deeply with a customizer function that modifies matching keys
    return cloneDeepWith(object, (value: unknown, key) => {
        if (keys.includes(key as string) && isString(value)) {
            return modify(value);
        }

        return undefined;
    });
}
