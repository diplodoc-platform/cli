import {join, relative} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Logger} from '~/core/logger';
import {normalizePath} from '~/core/utils';

import {MarkdownService} from './MarkdownService';

type Run = ConstructorParameters<typeof MarkdownService>[0];

vi.mock('~/core/logger');

function createMarkdown(files: Record<string, string>) {
    const input = '/docs';
    const run = {
        input,
        config: {
            outputFormat: 'html',
            preprocess: {mergeIncludes: true},
            template: {
                enabled: false,
                keepNotVar: true,
                legacyConditions: false,
                features: {substitutions: false},
                scopes: {code: false},
            },
        },
        logger: new Logger(),
        vars: {for: () => ({__metadata: {}, __system: {}})},
        meta: {
            addMetadata: vi.fn(),
            addSystemVars: vi.fn(),
            add: vi.fn(),
            get: () => ({}),
        },
        read: vi.fn(async (path: string) => {
            const file = normalizePath(relative(input, path));
            if (files[file] === undefined) {
                throw Object.assign(new Error(`Missing ${file}`), {code: 'ENOENT'});
            }
            return files[file];
        }),
        exists: (path: string) => files[normalizePath(relative(input, path))] !== undefined,
    } as unknown as Run;

    return {markdown: new MarkdownService(run), run};
}

function included(path: string, body: string) {
    return `{% included (${path}) %}\n${body}\n{% endincluded %}`;
}

describe('Markdown resource relations', () => {
    it('tracks reachable nested embedded SVGs at their logical origin', async () => {
        const {markdown} = createMarkdown({
            'ru/page.md': [
                '![Root](_assets/root.svg)',
                '{% include [Outer](_includes/outer.md) %}',
                included('_includes/outer.md', '{% include [Button](deep/button.md) %}'),
                included(
                    '_includes/outer.md:deep/button.md',
                    '![Plus](../../_assets/plus.svg)\n![Again](../../_assets/plus.svg)',
                ),
            ].join('\n\n'),
        });

        const graph = await markdown.relations(normalizePath('ru/page.md'));

        expect(graph.getNodeData('ru/_assets/plus.svg')).toEqual({type: 'resource'});
        expect(graph.directDependentsOf('ru/_assets/plus.svg')).toEqual(['ru/page.md']);
        expect(graph.directDependenciesOf('ru/page.md')).toEqual([
            'ru/_includes/outer.md',
            'ru/_assets/root.svg',
            'ru/_assets/plus.svg',
        ]);
    });

    it('follows physical includes to reachable embedded definitions', async () => {
        const {markdown} = createMarkdown({
            'ru/page.md': [
                '{% include [Physical](_includes/physical.md) %}',
                included('_includes/physical.md:button.md', '![Plus](../_assets/plus.svg)'),
            ].join('\n\n'),
            'ru/_includes/physical.md': '{% include [Button](button.md) %}',
        });

        const graph = await markdown.relations(normalizePath('ru/page.md'));

        expect(graph.getNodeData('ru/_assets/plus.svg')).toEqual({type: 'resource'});
        expect(graph.dependentsOf('ru/_assets/plus.svg')).toContain('ru/page.md');
    });

    it('excludes assets from unreachable appendices, code and comments', async () => {
        const {markdown} = createMarkdown({
            'ru/page.md': [
                '{% include [Button](_includes/button.md) %}',
                included(
                    '_includes/button.md',
                    [
                        '![Real](../_assets/real.svg)',
                        '`![Inline](../_assets/inline.svg)`',
                        '```md\n![Code](../_assets/code.svg)\n```',
                        '<!-- ![Comment](../_assets/comment.svg) -->',
                    ].join('\n\n'),
                ),
                included('_includes/unused.md', '![Unused](../_assets/unused.svg)'),
            ].join('\n\n'),
        });

        const graph = await markdown.relations(normalizePath('ru/page.md'));

        expect(graph.getNodeData('ru/_assets/real.svg')).toEqual({type: 'resource'});
        for (const name of ['inline', 'code', 'comment', 'unused']) {
            expect(graph.hasNode(`ru/_assets/${name}.svg`)).toBe(false);
        }
    });

    it('drops old embedded resource relations after the page is released', async () => {
        const files = {
            'ru/page.md': [
                '{% include [Button](_includes/button.md) %}',
                included('_includes/button.md', '![Plus](../_assets/plus.svg)'),
            ].join('\n\n'),
        };
        const {markdown} = createMarkdown(files);
        const before = await markdown.relations(normalizePath('ru/page.md'));
        expect(before.hasNode('ru/_assets/plus.svg')).toBe(true);

        files['ru/page.md'] = '# Updated page';
        markdown.release(normalizePath('ru/page.md'));
        const after = await markdown.relations(normalizePath('ru/page.md'));

        expect(after.hasNode('ru/_assets/plus.svg')).toBe(false);
        expect(after.directDependenciesOf('ru/page.md')).toEqual([]);
    });

    it('preserves ordinary physical include resource edges without embedded scanning', async () => {
        const {markdown, run} = createMarkdown({
            'page.md': '{% include [Button](_includes/button.md) %}',
            '_includes/button.md': '![Plus](../_assets/plus.svg)',
        });
        const embedded = vi.spyOn(markdown, 'embeddedAssets');

        const graph = await markdown.relations(normalizePath('page.md'));

        expect(graph.directDependenciesOf('page.md')).toEqual(['_includes/button.md']);
        expect(graph.directDependenciesOf('_includes/button.md')).toEqual(['_assets/plus.svg']);
        expect(graph.dependentsOf('_assets/plus.svg')).toContain('page.md');
        expect(embedded).not.toHaveBeenCalled();
        expect(run.read).toHaveBeenCalledWith(normalizePath(join('/docs', 'page.md')));
    });
});
