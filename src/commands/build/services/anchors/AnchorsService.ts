import type {Run} from '../../run';
import type {AssetInfo, EntryGraph, EntryGraphNode, IncludeInfo} from '~/core/markdown';
import type {AnchorIndex} from './types';

import {createHash} from 'node:crypto';
import {extname, join} from 'node:path';
import {parseHref} from '@diplodoc/utils';

import {bounded, normalizePath} from '~/core/utils';

const MARKDOWN_EXTENSION = /\.md$/i;

type CacheItem = {
    signature: string;
    value: Promise<ReadonlySet<string>>;
};

export class AnchorsService {
    private readonly run: Run;

    private readonly cache = new Map<NormalizedPath, CacheItem>();

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

    private async get(path: NormalizedPath): Promise<ReadonlySet<string>> {
        const graph = await this.run.markdown.graph(path);
        const signature = getGraphSignature(graph);
        const cached = this.cache.get(path);
        if (cached?.signature === signature) {
            return cached.value;
        }

        const value = this.collect(path, graph);
        this.cache.set(path, {signature, value});

        try {
            return await value;
        } catch (error) {
            if (this.cache.get(path)?.value === value) {
                this.cache.delete(path);
            }
            throw error;
        }
    }

    private async collect(path: NormalizedPath, graph: EntryGraph): Promise<ReadonlySet<string>> {
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

function getGraphSignature(graph: EntryGraph) {
    const digest = createHash('sha256');

    const visit = (node: Pick<EntryGraph, 'path' | 'content' | 'deps'>) => {
        digest.update(node.path);
        digest.update('\0');
        digest.update(node.content);
        digest.update('\0');
        node.deps.forEach(visit);
    };

    visit(graph);

    return digest.digest('hex');
}
