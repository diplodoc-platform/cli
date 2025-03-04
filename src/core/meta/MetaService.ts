import type {Run} from '~/core/run';
import type {Meta, Resources} from './types';

import {omit, uniq} from 'lodash';

import {copyJson, normalizePath} from '~/core/utils';

import {getHooks, withHooks} from './hooks';

type Config = {
    addSystemMeta: boolean;
};

@withHooks
export class MetaService {
    readonly name = 'Meta';

    // private run: Run<Config>;

    private config: Config;

    private meta: Map<NormalizedPath, Meta> = new Map();

    constructor(run: Run<Config>) {
        // this.run = run;
        this.config = run.config;
    }

    /**
     * Returns non normalized current readonly metadata for selected path.
     */
    get(path: RelativePath) {
        const file = normalizePath(path);
        return copyJson(this.meta.get(file)) || this.initialMeta();
    }

    /**
     * Returns normalized merged metadata for selected path.
     */
    async dump(path: RelativePath) {
        const file = normalizePath(path);
        const meta = copyJson(this.meta.get(file)) || this.initialMeta();

        for (const field of ['script', 'style', 'keywords'] as const) {
            if (!meta[field]) {
                continue;
            }

            meta[field] = uniq(meta[field] as string[]).filter(Boolean);
        }

        for (const field of ['script', 'style', 'keywords', 'contributors', 'csp'] as const) {
            if (!meta[field]?.length) {
                delete meta[field];
            }
        }

        for (const field of ['metadata', '__system']) {
            if (!meta[field]) {
                continue;
            }

            if (!Object.keys(meta[field] as Hash).length) {
                delete meta[field];
            }
        }

        return getHooks(this).Dump.promise(meta, file);
    }

    add(path: RelativePath, record: Hash) {
        const file = normalizePath(path);

        const meta = this.meta.get(file) || this.initialMeta();
        const result = Object.assign(
            meta,
            omit(record, ['script', 'style', 'csp', 'metadata', '__system']),
        );

        this.meta.set(file, result);

        this.addMetadata(path, record.metadata);
        this.addSystemVars(path, record.__system);

        return meta;
    }

    addResources(path: RelativePath, resources: Resources | undefined) {
        const file = normalizePath(path);

        if (!resources) {
            return;
        }

        const meta = this.meta.get(file) || this.initialMeta();

        if (Array.isArray(resources.script)) {
            meta.script = uniq([...(meta.script || []), ...resources.script]);
        }

        if (Array.isArray(resources.style)) {
            meta.style = uniq([...(meta.style || []), ...resources.style]);
        }

        if (Array.isArray(resources.csp)) {
            for (const record of resources.csp) {
                for (const [key, value] of Object.entries(record)) {
                    record[key] = ([] as string[]).concat(value);
                }
            }

            meta.csp = [...(meta.csp || []), ...resources.csp];
        }

        this.meta.set(file, meta);
    }

    addMetadata(path: RelativePath, metadata: Hash | undefined) {
        const file = normalizePath(path);

        if (!metadata) {
            return;
        }

        if (!Array.isArray(metadata)) {
            metadata = Object.entries(metadata).map(([name, content]) => ({name, content}));
        }

        const meta = this.meta.get(file) || this.initialMeta();
        meta.metadata = metadata.concat(meta.metadata || []);

        this.meta.set(file, meta);
    }

    addSystemVars(path: RelativePath, vars: Hash | undefined) {
        const file = normalizePath(path);

        if (!vars || !this.config.addSystemMeta) {
            return;
        }

        const meta = this.meta.get(file) || this.initialMeta();
        meta.__system = Object.assign({}, meta.__system, vars);

        this.meta.set(file, meta);
    }

    private initialMeta(): Meta {
        return {
            metadata: [],
            style: [],
            script: [],
            csp: [],
        };
    }
}
