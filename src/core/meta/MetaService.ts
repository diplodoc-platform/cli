import type {Run} from '~/core/run';
import type {Meta, Resources} from './types';

import {omit, pick, uniq} from 'lodash';

import {normalizePath} from '~/core/utils';

type Config = {
    allowCustomResources: boolean;
    addSystemMeta: boolean;
    resources: Resources;
};

const copy = <T extends object>(json: T | undefined): T =>
    json ? JSON.parse(JSON.stringify(json)) : json;

export class MetaService {
    // private run: Run<Config>;

    private config: Config;

    private meta: Map<NormalizedPath, Meta> = new Map();

    constructor(run: Run<Config>) {
        // this.run = run;
        this.config = run.config;
    }

    dump(path: RelativePath) {
        const file = normalizePath(path);
        const meta = copy(this.meta.get(file)) || this.initialMeta();

        for (const field of ['script', 'style', 'keywords', 'contributors'] as const) {
            if (!meta[field]) {
                continue;
            }

            const filtered = uniq(meta[field]).filter(Boolean);

            if (!filtered.length) {
                delete meta[field];
            } else {
                meta[field] = filtered;
            }
        }

        for (const field of ['csp', 'metadata', '__system']) {
            if (!meta[field]) {
                continue;
            }

            if (!Object.keys(meta[field] as Hash).length) {
                delete meta[field];
            }
        }

        return meta;
    }

    add(path: RelativePath, record: Hash) {
        const file = normalizePath(path);

        const meta = this.meta.get(file) || this.initialMeta();
        const result = Object.assign(
            {},
            meta,
            omit(record, ['script', 'style', 'csp', 'metadata', '__system']),
        );

        this.meta.set(file, result);

        this.addResources(path, pick(record, ['script', 'style', 'csp']));
        this.addMetadata(path, record.metadata);
        this.addSystemVars(path, record.__system);
    }

    addResources(path: RelativePath, resources: Resources | undefined) {
        const file = normalizePath(path);

        if (!this.config.allowCustomResources || !resources) {
            return;
        }

        const meta = this.meta.get(file) || this.initialMeta();

        if (Array.isArray(resources.script)) {
            meta.script = uniq([...(meta.script || []), ...resources.script]);
        }

        if (Array.isArray(resources.style)) {
            meta.style = uniq([...(meta.style || []), ...resources.style]);
        }

        // for (const [key] of Object.keys(ResourceType)) {
        //     if (resources[key]) {
        //         meta[key] = uniq([...(meta[key] || []), ...resources[key]]);
        //     }
        // }

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
        meta.metadata = (meta.metadata || []).concat(metadata);

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
            csp: {},
            __system: {},
        };
    }
}
