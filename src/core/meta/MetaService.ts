import type {Run} from '~/core/run';
import type {Alternate, Meta, RawResources} from './types';

import {flow, omit, uniq} from 'lodash';

import {copyJson, get, normalizePath, shortLink, zip} from '~/core/utils';

import {getHooks, withHooks} from './hooks';

type Config = {
    addSystemMeta: boolean;
};

type MetaItem = {
    name: string;
    content: string;
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
    get(path: RelativePath): DeepFrozen<Meta> {
        const file = normalizePath(path);

        if (!this.meta.has(file)) {
            this.meta.set(file, this.initialMeta());
        }

        return this.meta.get(file) as DeepFrozen<Meta>;
    }

    set(path: RelativePath, meta: Meta) {
        const file = normalizePath(path);
        this.meta.set(file, meta);
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

        for (const field of [
            'script',
            'style',
            'keywords',
            'contributors',
            'csp',
            'alternate',
        ] as const) {
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

        // check repeat right
        if (meta['restricted-access']?.length && record['restricted-access']) {
            for (const access of meta['restricted-access']) {
                record['restricted-access'] = record['restricted-access'].filter(
                    (recordAccess: string[]) =>
                        recordAccess.sort().join(',') !== access.slice().sort().join(','),
                );
            }
        }
        if (record['restricted-access']?.length > 0) {
            meta['restricted-access'] = [
                ...(meta['restricted-access'] || []),
                ...record['restricted-access'],
            ];
        }

        const result = Object.assign(
            meta,
            omit(record, [
                'script',
                'style',
                'csp',
                'metadata',
                'alternate',
                '__system',
                'restricted-access',
            ]),
        );

        this.meta.set(file, result);

        this.addMetadata(path, record.metadata);
        this.addAlternates(path, record.alternate);
        this.addSystemVars(path, record.__system);

        return meta;
    }

    addResources(path: RelativePath, resources: RawResources | undefined) {
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
            const records = [];
            for (const csp of resources.csp) {
                const record: Hash<string[]> = {};
                for (const [key, value] of Object.entries(csp)) {
                    record[key] = ([] as string[]).concat(value);
                }
                records.push(record);
            }

            meta.csp = [...(meta.csp || []), ...records];
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
        meta.metadata = meta.metadata || [];
        // Add without dublicates
        metadata.forEach((item: Hash<MetaItem>) => {
            if (
                !meta.metadata?.find(
                    (metaItem: Hash<MetaItem>) =>
                        metaItem.name === item.name && metaItem.content === item.content,
                )
            ) {
                meta.metadata?.push(item);
            }
        });

        this.meta.set(file, meta);
    }

    addAlternates(path: RelativePath, alternates: (NormalizedPath | Alternate)[] | undefined) {
        const file = normalizePath(path);
        const normalized = (alternates || []).map((item) => {
            if (typeof item === 'string') {
                return {href: item};
            }

            return item;
        });

        const hash = flow(get('href'), shortLink);
        const meta = this.meta.get(file) || this.initialMeta();
        const alternate = (meta.alternate = meta.alternate || []);
        const curr = zip(alternate.map(hash), alternate);
        const next = zip(normalized.map(hash), normalized);

        for (const [key, value] of Object.entries(next)) {
            if (!curr[key]) {
                alternate.push(value);
            }
        }

        meta.alternate = alternate;

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
            alternate: [],
            style: [],
            script: [],
            csp: [],
        };
    }
}
