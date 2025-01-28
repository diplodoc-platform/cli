import type {Run as BaseRun} from '~/core/run';
import type {VarsService} from '~/core/vars';
import type {MetaService, Resources} from '~/core/meta';
import type {VcsService} from '~/core/vcs';
import type {LeadingPage, RawLeadingPage} from './types';
import type {LoaderContext} from './loader';

import {join} from 'node:path';
import {dump, load} from 'js-yaml';
import {LINK_KEYS} from '@diplodoc/client/ssr';

import {bounded, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';
import {loader} from './loader';
import {cloneDeepWith, isString} from 'lodash';

type Run = BaseRun<LeadingServiceConfig> & {
    vars: VarsService;
    meta: MetaService;
    vcs: VcsService;
};

type Serializer = (yaml: LeadingPage) => any;

export type LeadingServiceConfig = {
    resources: Resources;
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
    private run: Run;

    private config: LeadingServiceConfig;

    private cached: Hash<LeadingPage> = {};

    constructor(run: Run) {
        this.run = run;
        this.config = run.config;
    }

    @bounded async load(path: RelativePath): Promise<LeadingPage> {
        const file = normalizePath(path);

        if (this.cached[file]) {
            return this.cached[file];
        }

        const vars = await this.run.vars.load(file);
        const raw = await this.run.read(join(this.run.input, file));
        const yaml = load(raw) as RawLeadingPage;

        const context: LoaderContext = {
            path,
            vars,
            options: {
                resolveConditions: this.config.template.features.conditions,
                resolveSubstitutions: this.config.template.features.substitutions,
            },
        };

        const leading = await loader.call(context, yaml);

        this.run.meta.addMetadata(path, vars.__metadata);
        this.run.meta.addSystemVars(path, vars.__system);
        this.run.meta.addResources(path, this.config.resources);
        const meta = this.run.meta.add(file, leading.meta || {});
        this.run.meta.add(path, await this.run.vcs.metadata(file, meta));

        delete leading.meta;

        this.cached[file] = leading;

        return leading;
    }

    @bounded async dump<T extends Serializer>(
        path: RelativePath,
        serialize?: T,
    ): Promise<ReturnType<T>> {
        serialize = serialize || (dump as T);

        const file = normalizePath(path);
        const leading = await this.load(file);
        const meta = await this.run.meta.dump(file);

        leading.meta = meta;

        const result = await getHooks(this).Dump.promise(leading, file);

        if (typeof result === 'string') {
            return result;
        }

        return serialize(result) as ReturnType<T>;
    }

    @bounded walkLinks(leading: LeadingPage | undefined, walker: (link: string) => any) {
        if (!leading) {
            return;
        }

        return modifyValuesByKeys(leading, LINK_KEYS, walker);
    }
}

function modifyValuesByKeys(
    object: object,
    keys: string[],
    modify: (value: string) => string,
) {
    // Clone the object deeply with a customizer function that modifies matching keys
    return cloneDeepWith(object, (value: unknown, key) => {
        if (keys.includes(key as string) && isString(value)) {
            return modify(value);
        }

        return undefined;
    });
}
