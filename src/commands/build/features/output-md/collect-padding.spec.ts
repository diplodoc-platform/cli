import type {EntryGraph, EntryGraphNode} from '~/core/markdown';
import type * as TransformParser from '@diplodoc/transform/parser';

import {expect, it, vi} from 'vitest';

import {normalizePath} from '~/core/utils';
import {setupRun} from '~/commands/build/__tests__';

import {MarkdownCollector} from './collect';

const counts = vi.hoisted(() => ({parses: 0}));
vi.mock('@diplodoc/transform/parser', async (original) => {
    const actual = await original<typeof TransformParser>();
    return {
        ...actual,
        default: (...args: Parameters<typeof actual.default>) => {
            const parser = actual.default(...args);
            const parse = parser.parseDocument.bind(parser);
            parser.parseDocument = (...input) => {
                counts.parses++;
                return parse(...input);
            };
            return parser;
        },
    };
});

function graph(content: string, matches: string[]): EntryGraph {
    let cursor = 0;
    const deps: EntryGraphNode[] = matches.map((match) => {
        const start = content.indexOf(match, cursor);
        cursor = start + match.length;
        return {
            path: normalizePath('part.md'),
            content: '# One {#one}\n\nBody one.\n\n# Two {#two}\n\nBody two.',
            deps: [],
            assets: [],
            hash: null,
            search: null,
            link: match.includes('#two') ? 'part.md#two' : 'part.md#one',
            match,
            location: [start, start + match.length],
        };
    });
    return {path: normalizePath('main.md'), content, deps, assets: []};
}

it('uses one existing parse per inspection and keeps per-parent marker ownership', async () => {
    const one = '{% include [part](part.md#one) %}';
    const two = '{% include [part](part.md#two) %}';
    const source = '\u00a0' + one + '\n\n' + one + '\n\n> \u00a0' + two;
    const input = graph(source, [one, one, two]);
    const before = JSON.stringify(input);
    const run = setupRun({langs: ['en'], content: {maxInlineSvgSize: 1024}});
    vi.spyOn(run.markdown, 'graph').mockResolvedValue(input);
    const inspection = vi.spyOn(run, 'inspectMergeSource');
    const oldInspection = vi.spyOn(run, 'inspectFootnotes');
    const collector = new MarkdownCollector(run, {mergeIncludes: true});
    counts.parses = 0;
    const output = await collector.collect(input.path);
    expect(counts.parses).toBe(inspection.mock.calls.length);
    expect(oldInspection).not.toHaveBeenCalled();
    expect(output).toContain('\u00a0' + one);
    expect(output).toContain('> \u00a0' + two);
    expect(output).toContain('Body one.');
    expect(output.split(one)).toHaveLength(2);
    expect(JSON.stringify(input)).toBe(before);
    const parsed = counts.parses;
    expect(await collector.collect(input.path)).toBe(output);
    expect(counts.parses).toBe(parsed);
});

it('indexes final audience-filtered source after dependency locations are remapped', async () => {
    const hidden = '{% include [part](part.md#one) %}';
    const shown = '{% include [part](part.md#two) %}';
    const source = ':::visibility agent\n' + hidden + '\n:::\n\n> \u00a0' + shown;
    const input = graph(source, [hidden, shown]);
    const run = setupRun({langs: ['en'], content: {maxInlineSvgSize: 1024}});
    vi.spyOn(run.markdown, 'graph').mockResolvedValue(input);
    const inspection = vi.spyOn(run, 'inspectMergeSource');
    const collector = new MarkdownCollector(run, {mergeIncludes: true}, {audience: 'human'});
    const output = await collector.collect(input.path);
    const rootCall = inspection.mock.calls.find(([, path]) => path === input.path);
    expect(rootCall?.[0]).not.toContain(hidden);
    expect(rootCall?.[0]).toContain('> \u00a0' + shown);
    expect(output).toContain('> \u00a0' + shown);
    expect(output).not.toContain(hidden);
    expect(input.content).toBe(source);
    expect(input.deps).toHaveLength(2);
});
