import type {Run} from '~/commands/build';
import type {EntryGraph, EntryGraphNode} from '~/core/markdown';

import {describe, expect, it, vi} from 'vitest';

import {normalizePath} from '~/core/utils';

import {
    CollectedContentCache,
    MarkdownCollector,
    SELF_CONTAINED,
    filterGraphAudience,
} from './collect';

describe('filterGraphAudience', () => {
    it('keeps only dependencies that survive audience filtering and updates their offsets', () => {
        const secret = '{% include [secret](_includes/secret.md) %}';
        const shared = '{% include [shared](_includes/shared.md) %}';
        const content = [
            '# Page',
            ':::visibility agent',
            secret,
            ':::',
            ':::visibility human',
            shared,
            ':::',
        ].join('\n');
        const graph = makeGraph(content, [
            makeDep(content, secret, '_includes/secret.md'),
            makeDep(content, shared, '_includes/shared.md'),
        ]);

        const filtered = filterGraphAudience(graph, 'human');

        expect(filtered.graph.content).not.toContain('secret');
        expect(filtered.graph.content).toContain(shared);
        expect(filtered.graph.deps).toHaveLength(1);
        expect(filtered.graph.deps[0].path).toBe('_includes/shared.md');
        expect(filtered.graph.content.slice(...filtered.graph.deps[0].location)).toBe(shared);
        expect(filtered.result.audienceSpecificContent).toEqual(['human', 'agent']);
    });

    it('does not turn an include example in a fenced block into a dependency', () => {
        const example = '{% include [secret](_includes/secret.md) %}';
        const live = '{% include [live](_includes/live.md) %}';
        const content = ['```md', example, '```', ':::visibility agent', live, ':::'].join('\n');
        const graph = makeGraph(content, [makeDep(content, live, '_includes/live.md')]);

        const filtered = filterGraphAudience(graph, 'human');

        expect(filtered.graph.content).toContain(example);
        expect(filtered.graph.content).not.toContain(live);
        expect(filtered.graph.deps).toEqual([]);
    });

    it('preserves embedded include content that has no live directive', () => {
        const content = [
            '# Recollected page',
            '{% included (_includes/cached.md) %}',
            'Cached content.',
            '{% endincluded %}',
        ].join('\n');

        const filtered = filterGraphAudience(makeGraph(content), 'human');

        expect(filtered.graph.content).toBe(content);
        expect(filtered.graph.deps).toEqual([]);
    });

    it('updates asset offsets after removing a preceding visibility block', () => {
        const image = '![Diagram](diagram.svg)';
        const content = [':::visibility agent', 'Secret.', ':::', image].join('\n');
        const start = content.indexOf(image);
        const graph = makeGraph(content);
        graph.assets.push({
            path: normalizePath('diagram.svg'),
            type: 'image',
            title: 'Diagram',
            autotitle: false,
            hash: null,
            search: null,
            location: [start, start + image.length],
        });

        const filtered = filterGraphAudience(graph, 'human');

        expect(filtered.graph.assets).toHaveLength(1);
        expect(filtered.graph.content.slice(...filtered.graph.assets[0].location)).toBe(image);
    });
});

function makeGraph(content: string, deps: EntryGraphNode[] = []): EntryGraph {
    return {
        path: normalizePath('index.md'),
        content,
        deps,
        assets: [],
    };
}

function makeDep(content: string, match: string, path: string): EntryGraphNode {
    const start = content.indexOf(match);

    return {
        path: normalizePath(path),
        content: 'Dependency content.',
        deps: [],
        assets: [],
        hash: null,
        search: null,
        link: path,
        match,
        location: [start, start + match.length],
    };
}

describe('content-keyed collection cache', () => {
    function setup() {
        const graph = makeGraph('{% include [shared](shared.md) %}');
        graph.deps = [makeDep(graph.content, graph.content, 'shared.md')];
        graph.deps[0].content = '# Alpha';
        const run = {
            markdown: {graph: vi.fn(async () => graph)},
            config: {content: {}},
            logger: {warn: vi.fn()},
        } as unknown as Run;
        const cache = new CollectedContentCache();
        const collect = (audience: 'human' | 'agent' = 'human') =>
            new MarkdownCollector(run, SELF_CONTAINED, {audience, processedContent: cache}).collect(
                normalizePath('index.md'),
            );
        return {graph, cache, collect, run};
    }

    it('reuses identical resolved subtrees across isolated collectors', async () => {
        const {cache, collect} = setup();
        const store = vi.spyOn(cache, 'set');
        expect(await collect()).toContain('# Alpha');
        const stored = store.mock.calls.length;
        expect(stored).toBeGreaterThan(0);
        expect(await collect()).toContain('# Alpha');
        expect(store).toHaveBeenCalledTimes(stored);
    });

    it('invalidates ancestors when a nested include resolves to different variables', async () => {
        const {graph, collect} = setup();
        expect(await collect()).toContain('# Alpha');
        graph.deps[0].content = '# Beta';
        const beta = await collect();
        expect(beta).toContain('# Beta');
        expect(beta).not.toContain('# Alpha');
        graph.deps[0].content = '# Alpha';
        expect(await collect()).toContain('# Alpha');
    });

    it('keeps include fragment and notitle semantics on a cache hit', async () => {
        const {graph, collect} = setup();
        graph.deps[0].content = '# Alpha\n\nBody';
        expect(await collect()).toContain('# Alpha');
        graph.deps[0].match = '{% include notitle [shared](shared.md) %}';
        const hidden = await collect();
        expect(hidden).not.toContain('# Alpha');
        expect(hidden).toContain('Body');
    });

    it('retains audience diagnostics when different source blocks have identical visible text', async () => {
        const {graph, run, cache} = setup();
        const collect = () =>
            new MarkdownCollector(run, SELF_CONTAINED, {
                audience: 'human',
                processedContent: cache,
            }).collectWithInfo(normalizePath('index.md'));
        graph.deps[0].content = '# Human\n';
        expect((await collect()).audienceSpecificContent).toEqual([]);
        graph.deps[0].content = ':::visibility human\n# Human\n:::\n';
        expect((await collect()).audienceSpecificContent).toContain('human');
    });

    it('does not mix human and agent visibility', async () => {
        const {graph, collect} = setup();
        graph.deps[0].content =
            ':::visibility human\n# Human\n:::\n:::visibility agent\n# Agent\n:::';
        expect(await collect('human')).toContain('# Human');
        const agent = await collect('agent');
        expect(agent).toContain('# Agent');
        expect(agent).not.toContain('# Human');
    });
});
