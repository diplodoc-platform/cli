import {join, relative} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Logger} from '~/core/logger';
import {Defer, normalizePath} from '~/core/utils';

import {MarkdownService} from './MarkdownService';
import {getHooks} from './hooks';

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

describe('Include context lifetime', () => {
    const page = normalizePath('page.md');
    const include = normalizePath('_includes/button.md');

    function setup() {
        return createMarkdown({
            'page.md': '{% include [Button](_includes/button.md) %}',
            '_includes/button.md': '# Button\n\n![Icon](../icon.svg)',
        });
    }

    function reads(run: Run) {
        return vi
            .mocked(run.read)
            .mock.calls.filter(([path]) => path.endsWith('/_includes/button.md')).length;
    }

    it('restores a cold include without reading or processing it again', async () => {
        const {markdown, run} = setup();
        const revision = markdown.revision;
        await markdown.withContext(page, async () => {
            await markdown.graph(page);
            await markdown.graph(page);
            expect(reads(run)).toBe(1);
        });
        expect(markdown.revision).toBe(revision);
        const graph = await markdown.withContext(page, () => markdown.graph(page));
        expect(reads(run)).toBe(1);
        expect(graph.deps[0].content).toContain('# Button');
        expect(graph.deps[0].assets[0].path).toBe('icon.svg');
        expect(
            vi.mocked(run.read).mock.calls.filter(([path]) => path.endsWith('/page.md')),
        ).toHaveLength(1);
    });

    it('keeps data until all overlapping readers of the same context finish', async () => {
        const {markdown, run} = setup();
        const ready = new Defer<void>();
        const release = new Defer<void>();
        const second = markdown.withContext(page, async () => {
            await markdown.graph(page);
            ready.resolve(undefined);
            await release.promise;
            await markdown.graph(page);
            expect(reads(run)).toBe(1);
        });
        try {
            await ready.promise;
            await markdown.withContext(page, () => markdown.graph(page));
            expect(reads(run)).toBe(1);
        } finally {
            release.resolve(undefined);
            await second;
        }
        await markdown.withContext(page, () => markdown.graph(page));
        expect(reads(run)).toBe(1);
    });

    it('cleans up after a failed reader', async () => {
        const {markdown, run} = setup();
        await expect(
            markdown.withContext(page, async () => {
                await markdown.graph(page);
                throw new Error('reader failed');
            }),
        ).rejects.toThrow('reader failed');
        await markdown.withContext(page, () => markdown.graph(page));
        expect(reads(run)).toBe(1);
    });

    it('preserves include data for another active article context', async () => {
        const {markdown, run} = setup();
        const other = normalizePath('other.md');
        await markdown.load(include, other);
        await markdown.withContext(page, () => markdown.graph(page));
        await markdown.load(include, other);
        expect(reads(run)).toBe(2);
    });

    it('does not expire Markdown-output include contexts', async () => {
        const {markdown, run} = setup();
        run.config.outputFormat = 'md';
        await markdown.withContext(page, () => markdown.graph(page));
        await markdown.withContext(page, () => markdown.graph(page));
        expect(reads(run)).toBe(1);
    });

    it('does not expire a page context while a nested title lookup finishes', async () => {
        const {markdown, run} = setup();
        await markdown.withContext(page, async () => {
            await markdown.graph(page);
            const titles = await markdown.titles(page);
            expect(titles['#']).toBe('Button');
            await markdown.graph(page);
            expect(reads(run)).toBe(1);
        });
        await markdown.withContext(page, () => markdown.graph(page));
        expect(reads(run)).toBe(1);
    });
});

describe('Context semantic diagnostic probe', () => {
    it('does not duplicate loader diagnostics for one unchanged context', async () => {
        const {markdown, run} = createMarkdown({
            'page.md': '{% include [Broken](_includes/broken.md) %}',
            '_includes/broken.md': '::: page-constructor\nblocks: [\n:::\n',
        });
        run.logger.warn = Object.assign(vi.fn(), {count: 0});
        const page = normalizePath('page.md');
        await markdown.withContext(page, () => markdown.graph(page));
        const first = vi.mocked(run.logger.warn).mock.calls.length;
        await markdown.withContext(page, () => markdown.graph(page));
        const second = vi.mocked(run.logger.warn).mock.calls.length;
        expect(first).toBeGreaterThan(0);
        expect(second).toBe(first);
    });
});

describe('Packed include context compatibility', () => {
    const page = normalizePath('page.md');
    const include = normalizePath('_includes/part.md');

    it('invalidates packed data when an include changes during watch', async () => {
        const files = {
            'page.md': '{% include [Part](_includes/part.md) %}',
            '_includes/part.md': '# Before',
        };
        const {markdown, run} = createMarkdown(files);
        await markdown.withContext(page, () => markdown.graph(page));
        files['_includes/part.md'] = '# After';
        markdown.release(include, page);
        const graph = await markdown.withContext(page, () => markdown.graph(page));
        expect(graph.deps[0].content).toBe('# After');
        expect(
            vi.mocked(run.read).mock.calls.filter(([path]) => path.endsWith('/_includes/part.md')),
        ).toHaveLength(2);
    });

    it('preserves Unicode and lone surrogates across a cold restore', async () => {
        const content = 'Text: Пример, 🧩, \ud800 and \udfff';
        const {markdown, run} = createMarkdown({
            'page.md': '{% include [Part](_includes/part.md) %}',
            '_includes/part.md': content,
        });
        const before = await markdown.withContext(page, () => markdown.graph(page));
        const after = await markdown.withContext(page, () => markdown.graph(page));
        expect(after.deps[0].content).toBe(before.deps[0].content);
        expect(after.deps[0].content).toBe(content);
        expect(
            vi.mocked(run.read).mock.calls.filter(([path]) => path.endsWith('/_includes/part.md')),
        ).toHaveLength(1);
    });

    it('keeps nonserializable plugin metadata cached without rerunning the collector', async () => {
        const {markdown, run} = createMarkdown({
            'page.md': '{% include [Part](_includes/part.md) %}',
            '_includes/part.md': '# Part',
        });
        const visits = vi.fn();
        getHooks(markdown).Collects.tap('test', () => [
            async function (content) {
                visits(this.path);
                this.api.meta.set({custom: () => 'plugin value'});
                return content;
            },
        ]);
        await markdown.init();
        await markdown.withContext(page, () => markdown.graph(page));
        await markdown.withContext(page, () => markdown.graph(page));
        expect(visits.mock.calls.filter(([path]) => path === include)).toHaveLength(1);
        expect(
            vi.mocked(run.read).mock.calls.filter(([path]) => path.endsWith('/_includes/part.md')),
        ).toHaveLength(1);
    });
});

describe('Custom metadata packing fallback', () => {
    it('does not invoke metadata accessors or change custom prototypes', async () => {
        class Marker {
            value = 'plugin';
        }
        const marker = new Marker();
        const getter = vi.fn(() => 'value');
        const metadata = Object.defineProperty({marker}, 'dynamic', {
            enumerable: true,
            get: getter,
        });
        const {markdown, run} = createMarkdown({
            'page.md': '{% include [Part](_includes/part.md) %}',
            '_includes/part.md': '# Part',
        });
        getHooks(markdown).Collects.tap('test', () => [
            async function (content) {
                this.api.meta.set(metadata);
                return content;
            },
        ]);
        await markdown.init();
        const page = normalizePath('page.md');
        await markdown.withContext(page, () => markdown.graph(page));
        await markdown.withContext(page, () => markdown.graph(page));
        expect(getter).not.toHaveBeenCalled();
        const calls = vi.mocked(run.meta.add).mock.calls;
        expect(calls.every(([, meta]) => meta.marker === marker)).toBe(true);
        expect(
            vi.mocked(run.read).mock.calls.filter(([path]) => path.endsWith('/_includes/part.md')),
        ).toHaveLength(1);
    });
});

describe('Packed cache allocation', () => {
    it('does not retain a separate zlib output chunk for each tiny cache entry', async () => {
        const files: Record<string, string> = {'_includes/part.md': '# Part'};
        for (let index = 0; index < 200; index++) {
            files[`page${index}.md`] = '{% include [Part](_includes/part.md) %}';
        }
        const {markdown} = createMarkdown(files);
        for (let index = 0; index < 200; index++) {
            const page = normalizePath(`page${index}.md`);
            await markdown.withContext(page, () => markdown.graph(page));
        }
        const cached = (markdown as unknown as {packedContexts: Map<string, {data: Buffer}>})
            .packedContexts;
        const buffers = [...cached.values()].map(({data}) => data);
        expect(buffers).toHaveLength(400);
        const backing = new Set(buffers.map((buffer) => buffer.buffer));
        const retained = [...backing].reduce((sum, buffer) => sum + buffer.byteLength, 0);
        const encoded = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
        // Allow the first/last shared slabs and eight-byte allocation alignment.
        expect(retained).toBeLessThanOrEqual(encoded + 2 * Buffer.poolSize + 7 * buffers.length);
    });
});

describe('Cold cache plugin metadata compatibility', () => {
    it('preserves shared plain metadata between a collector and later cached reads', async () => {
        const custom = {label: 'before'};
        const {markdown, run} = createMarkdown({'page.md': '# Page'});
        getHooks(markdown).Collects.tap('test', () => [
            async function (content) {
                this.api.meta.set({custom});
                return content;
            },
        ]);
        await markdown.init();
        const page = normalizePath('page.md');
        const read = () => markdown.withContext(page, () => markdown.graph(page));
        await read();
        custom.label = 'updated by collector';
        vi.mocked(run.meta.add).mockClear();
        await read();
        const last = vi.mocked(run.meta.add).mock.calls.at(-1)?.[1];
        expect(last?.custom).toEqual({label: 'updated by collector'});
        expect(last?.custom).toBe(custom);
        expect(run.read).toHaveBeenCalledTimes(1);
    });
});
