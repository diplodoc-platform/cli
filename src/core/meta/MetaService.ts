import type {Run} from '~/core/run';
import type {Alternate, Meta, RawResources} from './types';

import {flow, omit, uniq} from 'lodash';

import {copyJson, get, normalizePath, shortLink, zip} from '~/core/utils';

import {getHooks, withHooks} from './hooks';

type Config = {
    rawAddMeta: boolean;
    addSystemMeta: boolean;
    addResourcesMeta: boolean;
    addMetadataMeta: boolean;
};

type MetaItem = {
    name?: string;
    property?: string;
    content: string;
};

/**
 * Service for managing page metadata in the CLI build process.
 *
 * Stores, merges, and normalizes metadata for each document by path.
 * Provides methods for adding resources, custom meta tags, alternate links,
 * and system variables.
 *
 * @example
 * ```typescript
 * const metaService = new MetaService(run);
 * metaService.add('/docs/page.md', {title: 'My Page'});
 * const meta = await metaService.dump('/docs/page.md');
 * ```
 */
@withHooks
export class MetaService {
    readonly name = 'Meta';

    // private run: Run<Config>;

    private config: Config;

    private meta: Map<NormalizedPath, Meta> = new Map();

    /**
     * Creates a new MetaService instance.
     *
     * @param run - Run instance with configuration
     */
    constructor(run: Run<Config>) {
        // this.run = run;
        this.config = run.config;
    }

    /**
     * Returns current metadata for a path (creates initial metadata if not exists).
     *
     * Returns a frozen, read-only copy to prevent accidental modifications.
     * This is the non-normalized version - use `dump()` for final normalized metadata.
     *
     * @param path - Relative path to the document
     * @returns Frozen copy of metadata for the path
     */
    get(path: RelativePath): DeepFrozen<Meta> {
        const file = normalizePath(path);

        if (!this.meta.has(file)) {
            this.meta.set(file, this.initialMeta());
        }

        return this.meta.get(file) as DeepFrozen<Meta>;
    }

    /**
     * Sets metadata for a path (overwrites existing).
     *
     * @param path - Relative path to the document
     * @param meta - Metadata object to set
     */
    set(path: RelativePath, meta: Meta) {
        const file = normalizePath(path);
        this.meta.set(file, meta);
    }

    /**
     * Returns normalized, merged metadata for a path.
     *
     * Performs cleanup operations:
     * - Removes duplicates from arrays (script, style, keywords)
     * - Removes empty arrays (script, style, keywords, contributors, csp, alternate)
     * - Removes empty objects (metadata, __system)
     * - Runs Dump hook for final processing
     *
     * @param path - Relative path to the document
     * @returns Normalized metadata ready for use
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

    /**
     * Adds/merges metadata for a path.
     *
     * Handles special fields:
     * - `restricted-access`: Prevents duplicate access rules
     * - `metadata`: Custom meta tags (merged via `addMetadata()`)
     * - `alternate`: Alternate links (merged via `addAlternates()`)
     * - `__system`: System variables (merged via `addSystemVars()`)
     * - Other fields: Direct assignment (last value wins)
     *
     * @param path - Relative path to the document
     * @param record - Hash of metadata fields to add/merge
     * @param isRaw - Is metadata from load
     * @returns Updated metadata object
     */
    add(path: RelativePath, record: Hash, isRaw = false) {
        const file = normalizePath(path);

        if (this.config.rawAddMeta && isRaw) {
            this.meta.set(file, record);
            return;
        }

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

    /**
     * Adds page resources (scripts, styles, CSP) for a path.
     *
     * Scripts and styles are merged as unique arrays.
     * CSP records are normalized (strings converted to arrays).
     *
     * @param path - Relative path to the document
     * @param resources - Raw resources to add (undefined is ignored)
     */
    addResources(path: RelativePath, resources: RawResources | undefined) {
        const file = normalizePath(path);

        if (!resources || !this.config.addResourcesMeta) {
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

    /**
     * Adds custom meta tags for a path.
     *
     * Accepts hash or array of meta items.
     * Prevents duplicates by name/content or property/content.
     *
     * @param path - Relative path to the document
     * @param metadata - Hash of meta tags or array of meta items (undefined is ignored)
     */
    addMetadata(path: RelativePath, metadata: Hash | undefined) {
        const file = normalizePath(path);

        if (!metadata || !this.config.addMetadataMeta) {
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
                        (metaItem.name === item.name && metaItem.content === item.content) ||
                        (metaItem.property === item.property && metaItem.content === item.content),
                )
            ) {
                meta.metadata?.push(item);
            }
        });

        this.meta.set(file, meta);
    }

    /**
     * Adds alternate language links for a path.
     *
     * Accepts paths (strings) or Alternate objects.
     * Prevents duplicates by normalized href using short link comparison.
     *
     * @param path - Relative path to the document
     * @param alternates - Array of alternate paths or Alternate objects (undefined is ignored)
     */
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

    /**
     * Adds system variables for a path (only if config.addSystemMeta is enabled).
     *
     * Used for internal system metadata. Merged into `__system` field.
     *
     * @param path - Relative path to the document
     * @param vars - Hash of system variables to add (undefined is ignored)
     */
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
