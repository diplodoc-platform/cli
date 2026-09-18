import type {Run} from '../../run';
import type {AssetInfo, EntryGraph, EntryGraphNode, IncludeInfo} from '~/core/markdown';
import type {AnchorIndex} from './types';

import {extname, join} from 'node:path';
import {parseHref} from '@diplodoc/utils';

import {bounded, normalizePath} from '~/core/utils';

const MARKDOWN_EXTENSION = /\.md$/i;

export class AnchorsService {
    private readonly run: Run;

    // Anchors are collected once per target page and reused for the whole build.
    // Watch mode is out of scope here: page content does not change within a
    // single build run, so a plain per-path memoization is enough and avoids
    // re-rendering (and re-hashing) a popular page for every incoming link.
    private readonly cache = new Map<NormalizedPath, Promise<ReadonlySet<string>>>();

    constructor(run: Run) {
        this.run = run;
    }

    async index(file: NormalizedPath, assets: AssetInfo[]): Promise<AnchorIndex> {
        const targets = new Set<NormalizedPath>();

        for (const asset of assets) {
            if (
                !asset.hash ||
                asset.hash === '#' ||
                (asset.type !== 'link' && asset.type !== 'def')
            ) {
                continue;
            }

            const target = this.resolve((asset.path as NormalizedPath | null) || file);
            if (target && this.run.toc.entries.includes(target)) {
                targets.add(target);
            }
        }

        const index = new Map<NormalizedPath, ReadonlySet<string>>();
        await Promise.all(
            [...targets].map(async (target) => {
                index.set(target, await this.get(target));
            }),
        );

        return index as AnchorIndex;
    }

    @bounded
    resolve(path: NormalizedPath): NormalizedPath | null {
        let pathname: string | null;

        try {
            pathname = parseHref(path).pathname;
        } catch {
            return null;
        }

        if (!pathname) {
            return null;
        }

        let candidate = normalizePath(pathname);

        if (candidate.endsWith('/')) {
            if (this.exists(join(candidate, 'index.yaml'))) {
                return null;
            }

            candidate = normalizePath(join(candidate, 'index.md'));
        } else if (!extname(candidate)) {
            candidate = normalizePath(candidate + '.md');
        }

        if (!MARKDOWN_EXTENSION.test(candidate) || !this.exists(candidate)) {
            return null;
        }

        return candidate;
    }

    private get(path: NormalizedPath): Promise<ReadonlySet<string>> {
        const cached = this.cache.get(path);
        if (cached) {
            return cached;
        }

        const value = this.collect(path).catch((error) => {
            // Do not poison the cache with a rejected promise: drop it so a
            // later lookup can retry instead of replaying the same failure.
            if (this.cache.get(path) === value) {
                this.cache.delete(path);
            }
            throw error;
        });

        this.cache.set(path, value);

        return value;
    }

    private async collect(path: NormalizedPath): Promise<ReadonlySet<string>> {
        const graph = await this.run.markdown.graph(path);
        const anchorIds = new Set<string>();
        const {deps, assets} = flattenGraph(graph);

        await this.run.transform(path, graph.content, {
            deps,
            assets,
            anchorIds,
            reportErrors: false,
        });

        return anchorIds;
    }

    private exists(path: NormalizedPath) {
        return this.run.exists(join(this.run.input, path));
    }
}

function flattenGraph(graph: EntryGraph) {
    const deps: IncludeInfo[] = [];
    const assets: AssetInfo[] = [...graph.assets];

    const visit = (node: EntryGraphNode) => {
        deps.push({
            path: node.path,
            link: node.link,
            match: node.match,
            location: node.location,
            hash: node.hash,
            search: node.search,
        });
        assets.push(...node.assets);
        node.deps.forEach(visit);
    };

    graph.deps.forEach(visit);

    return {deps, assets};
}
