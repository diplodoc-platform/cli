import type {HashedGraphNode} from '../utils';

import {describe, expect, it} from 'vitest';
import transform from '@diplodoc/transform';
import includes from '@diplodoc/transform/plugins/includes';

import {normalizePath} from '~/core/utils';
import {setupRun} from '~/commands/build/__tests__';
import {hasPaddedIncludeParagraph} from '~/commands/build/footnote-inspection';

import {Scheduler} from '../utils';

import {canInlineInclude, mergeIncludes} from './merge-includes';

const inspectionRun = setupRun({langs: ['en'], content: {maxInlineSvgSize: 1024}});

const marker = '{% include [part](part.md) %}';
const run = {
    config: {content: {multilineTermDefinitions: false}},
    logger: {warn: () => {}},
} as unknown as Parameters<typeof mergeIncludes>[0];

function dependency(source: string, match = marker): HashedGraphNode {
    const start = source.indexOf(match);
    return {
        path: normalizePath('part.md'),
        link: 'part.md',
        match,
        location: [start, start + match.length],
        hash: '',
        search: null,
        content: 'Included body.',
        deps: [],
        paddedIncludeParagraph: hasPaddedIncludeParagraph(
            inspectionRun.inspectMergeSource(source, normalizePath('main.md'))
                .paddedIncludeParagraphs,
            [start, start + match.length],
            match,
        ),
    } as HashedGraphNode;
}

async function merge(source: string, dep: HashedGraphNode, sourceMaps: boolean, root = true) {
    const scheduler = new Scheduler([mergeIncludes(run, [dep], source, sourceMaps, root)]);
    await scheduler.schedule(normalizePath('main.md'));
    return scheduler.process(source);
}

function render(source: string) {
    return transform(source, {
        included: true,
        disableLiquid: true,
        plugins: [includes],
        root: '/docs',
        path: '/docs/main.md',
    }).result.html;
}

describe('standalone include padding during Markdown merging', () => {
    it.each(['\u00a0', '\ufeff', '\u000b', '\u000c', '\u2003', '   \u00a0  '])(
        'preserves renderer parity for padding %j on either edge',
        async (padding) => {
            for (const source of [padding + marker, marker + padding, padding + marker + padding]) {
                const dep = dependency(source);
                const expected = '<p>Included body.</p>\n';
                for (const sourceMaps of [false, true]) {
                    const merged = await merge(source, dep, sourceMaps);
                    expect(merged).toContain(source);
                    expect(render(merged)).toBe(expected);
                    expect(dep.location).toEqual([
                        source.indexOf(marker),
                        source.indexOf(marker) + marker.length,
                    ]);
                }
            }
        },
    );

    it.each([
        '\u00a0\n' + marker,
        marker + '\n\u00a0',
        '\u00a0\n' + marker + '\n\u00a0',
        '\u2003\n' + marker,
        marker + '\n\u000b',
        '\u00a0\r\n\u2003\r\n' + marker + '\r\n\u000c\r\n\ufeff',
    ])('preserves renderer parity for adjacent paragraph padding %j', async (source) => {
        for (const sourceMaps of [false, true]) {
            const dep = dependency(source);
            const location = [...dep.location];
            const merged = await merge(source, dep, sourceMaps);
            expect(canInlineInclude(dep, source)).toBe(false);
            expect(merged).toContain(source);
            expect(render(merged)).toBe('<p>Included body.</p>\n');
            expect(dep.location).toEqual(location);
        }
    });

    it.each([
        '\u00a0\n\n' + marker,
        marker + '\n \t\r\n\u00a0',
        'Previous prose.\n' + marker,
        marker + '\nFollowing prose.',
        '    Code.\n\n' + marker,
    ])('retains existing decisions across paragraph boundaries %j', (source) => {
        expect(canInlineInclude(dependency(source), source)).toBe(true);
    });

    it.each([
        ['  ', ''],
        ['\t', ''],
        ['', ' \t\r'],
        ['> ', ''],
        ['- ', ''],
        ['Before\u00a0', ''],
        ['|| \u00a0', ' ||'],
    ])('retains existing decisions for structural or ASCII edges %j / %j', (prefix, suffix) => {
        const source = prefix + marker + suffix;
        expect(canInlineInclude(dependency(source), source)).toBe(true);
    });

    it('retains nested hashed notitle selection through the existing fallback format', async () => {
        const match = '{% include notitle [part](outer-hash.md#chosen) %}';
        const source = '\u00a0' + match + '\u00a0';
        const dep = dependency(source, match);
        dep.path = normalizePath('outer-hash.md');
        dep.link = 'outer-hash.md#chosen';
        dep.content =
            '# Skip\n\nWrong.\n\n# Chosen {#chosen}\n\n{% include [inner](inner-hash.md) %}\n\n# Next\n\nWrong.';
        const inner = dependency(dep.content, '{% include [inner](inner-hash.md) %}');
        inner.path = normalizePath('inner-hash.md');
        inner.link = 'inner-hash.md';
        dep.deps = [inner];

        for (const sourceMaps of [false, true]) {
            const merged = await merge(source, dep, sourceMaps);
            expect(merged).toContain('{% included (outer-hash.md:inner-hash.md) %}');
            expect(render(merged)).toBe('<p>Included body.</p>\n');
        }
    });

    it.each([
        ['> \u00a0\n' + marker, '<blockquote>\n<p>Included body.</p>\n</blockquote>\n'],
        ['- \u00a0\n' + marker, '<ul>\n<li>\n<p>Included body.</p>\n</li>\n</ul>\n'],
        ['> \u00a0' + marker, '<blockquote>\n<p>Included body.</p>\n</blockquote>\n'],
        ['> \u00a0\n> ' + marker, '<blockquote>\n<p>Included body.</p>\n</blockquote>\n'],
        ['- \u00a0' + marker, '<ul>\n<li>\n<p>Included body.</p>\n</li>\n</ul>\n'],
        ['- ' + marker + '\n  \u00a0', '<ul>\n<li>\n<p>Included body.</p>\n</li>\n</ul>\n'],
    ])('uses the native paragraph context inside containers: %j', async (source, expected) => {
        for (const sourceMaps of [false, true]) {
            const dep = dependency(source);
            expect(canInlineInclude(dep, source)).toBe(false);
            expect(render(await merge(source, dep, sourceMaps))).toBe(expected);
        }
    });

    it('leaves non-root dependencies intact for the root fallback collector', async () => {
        const source = '\u00a0' + marker;
        expect(await merge(source, dependency(source), false, false)).toBe(source);
    });
});
