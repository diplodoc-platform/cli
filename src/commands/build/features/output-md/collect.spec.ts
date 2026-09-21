import type {EntryGraph, EntryGraphNode} from '~/core/markdown';

import {describe, expect, it} from 'vitest';

import {normalizePath} from '~/core/utils';

import {filterGraphAudience} from './collect';

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
