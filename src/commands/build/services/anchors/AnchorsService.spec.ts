import type {Run} from '../../run';
import type {AssetInfo, EntryGraph} from '~/core/markdown';

import {join, resolve} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Defer} from '~/core/utils';

import {AnchorsService} from './AnchorsService';

describe('AnchorsService', () => {
    const input = resolve('input');

    function setupCachedService() {
        const content = vi.fn(() => '## Page');
        const graph: EntryGraph = {
            path: 'page.md' as NormalizedPath,
            get content() {
                return content();
            },
            deps: [],
            assets: [],
        };
        const markdown = {revision: 0, graph: vi.fn(async () => graph)};
        const transform = vi.fn(
            async (_path: string, _content: string, options: {anchorIds?: Set<string>}) => {
                options.anchorIds?.add('page');
                return ['', {}] as const;
            },
        );
        const service = new AnchorsService({
            input,
            exists: () => true,
            toc: {entrySet: new Set(['page.md'])},
            markdown,
            transform,
        } as unknown as Run);
        const asset: AssetInfo = {
            path: 'page.md' as NormalizedPath,
            type: 'link',
            subtype: null,
            title: 'Page',
            autotitle: false,
            location: [0, 1],
            hash: '#page',
            search: null,
        };
        const index = (file = 'index.md') => service.index(file as NormalizedPath, [asset]);

        return {content, graph, markdown, transform, index};
    }

    it('shares graph construction, hashing and rendering across concurrent source pages', async () => {
        const {content, graph, markdown, transform, index} = setupCachedService();
        const pending = new Defer<EntryGraph>();
        markdown.graph.mockReturnValueOnce(pending.promise);

        const first = index();
        const second = index('other.md');
        expect(markdown.graph).toHaveBeenCalledTimes(1);
        pending.resolve(graph);

        const [firstIndex, secondIndex] = await Promise.all([first, second]);
        const thirdIndex = await index('third.md');
        expect(firstIndex.get('page.md' as NormalizedPath)).toEqual(new Set(['page']));
        expect(secondIndex.get('page.md' as NormalizedPath)).toBe(
            thirdIndex.get('page.md' as NormalizedPath),
        );
        expect(markdown.graph).toHaveBeenCalledTimes(1);
        // One content read for the signature and one for the renderer.
        expect(content).toHaveBeenCalledTimes(2);
        expect(transform).toHaveBeenCalledTimes(1);
    });

    it('rehashes after invalidation but retains the render when content is unchanged', async () => {
        const {content, markdown, transform, index} = setupCachedService();
        await index();

        markdown.revision++;
        await Promise.all([index(), index('other.md')]);

        expect(markdown.graph).toHaveBeenCalledTimes(2);
        expect(content).toHaveBeenCalledTimes(3);
        expect(transform).toHaveBeenCalledTimes(1);
    });

    it('retries a failed graph lookup', async () => {
        const {markdown, transform, index} = setupCachedService();
        markdown.graph.mockRejectedValueOnce(new Error('graph failed'));

        await expect(index()).rejects.toThrow('graph failed');
        await expect(index()).resolves.toBeInstanceOf(Map);
        expect(markdown.graph).toHaveBeenCalledTimes(2);
        expect(transform).toHaveBeenCalledTimes(1);
    });

    it('does not let an old failed lookup evict a newer generation', async () => {
        const {markdown, index} = setupCachedService();
        const pending = new Defer<EntryGraph>();
        markdown.graph.mockReturnValueOnce(pending.promise);
        const first = expect(index()).rejects.toThrow('old graph failed');

        markdown.revision++;
        const current = await index();
        pending.reject(new Error('old graph failed'));
        await first;

        expect((await index()).get('page.md' as NormalizedPath)).toBe(
            current.get('page.md' as NormalizedPath),
        );
        expect(markdown.graph).toHaveBeenCalledTimes(2);
    });

    it('resolves Markdown pages, extensionless paths, directories, and queries', () => {
        const existing = new Set<string>([
            join(input, 'page.md'),
            join(input, 'guide/index.md'),
            join(input, 'leading/index.yaml'),
        ]);
        const service = new AnchorsService({
            input,
            exists: (path: string) => existing.has(path),
        } as Run);

        expect(service.resolve('page.md' as NormalizedPath)).toBe('page.md');
        expect(service.resolve('page' as NormalizedPath)).toBe('page.md');
        expect(service.resolve('page.md?mode=compact' as NormalizedPath)).toBe('page.md');
        expect(service.resolve('guide/' as NormalizedPath)).toBe('guide/index.md');
        expect(service.resolve('leading/' as NormalizedPath)).toBeNull();
        expect(service.resolve('missing.md' as NormalizedPath)).toBeNull();
        expect(service.resolve('page.yaml' as NormalizedPath)).toBeNull();
    });

    it.each(['link', 'def'] as const)(
        'does not index another version of a %s target',
        async (type) => {
            const graph = vi.fn(async () => ({
                path: 'page.md' as NormalizedPath,
                content: '# Current heading',
                deps: [],
                assets: [],
            }));
            const run = {
                input,
                exists: (path: string) => path === join(input, 'page.md'),
                toc: {entrySet: new Set(['page.md'])},
                markdown: {revision: 0, graph},
                transform: vi.fn(async () => ['', {}] as const),
            } as unknown as Run;
            const service = new AnchorsService(run);
            const asset: AssetInfo = {
                path: 'page.md' as NormalizedPath,
                type,
                title: 'Historical page',
                autotitle: false,
                location: [0, 1],
                hash: '#historical-anchor',
                search: '?version=v25.1',
            };

            const index = await service.index('index.md' as NormalizedPath, [asset]);

            expect(index.size).toBe(0);
            expect(graph).not.toHaveBeenCalled();
        },
    );

    it('reuses unchanged anchors and refreshes changed pages and includes', async () => {
        const graph: EntryGraph = {
            path: 'page.md' as NormalizedPath,
            content: '# Page',
            deps: [
                {
                    path: '_includes/heading.md' as NormalizedPath,
                    content: '## Included',
                    deps: [],
                    assets: [],
                    link: '_includes/heading.md',
                    match: '',
                    location: [1, 1],
                    hash: null,
                    search: null,
                },
            ],
            assets: [],
        };
        const transform = vi.fn(
            async (_path: NormalizedPath, content: string, options: {anchorIds?: Set<string>}) => {
                options.anchorIds?.add(content.includes('Updated') ? 'updated' : 'page');
                options.anchorIds?.add(
                    graph.deps[0].content.includes('Revised') ? 'revised' : 'included',
                );
                return ['', {}] as const;
            },
        );
        const run = {
            input,
            exists: (path: string) => path === join(input, 'page.md'),
            toc: {entrySet: new Set(['page.md'])},
            markdown: {revision: 0, graph: vi.fn(async () => graph)},
            transform,
        } as unknown as Run;
        const service = new AnchorsService(run);
        const asset: AssetInfo = {
            path: 'page.md' as NormalizedPath,
            type: 'link',
            subtype: null,
            title: 'Page',
            autotitle: false,
            location: [0, 1],
            hash: '#page',
            search: null,
        };

        const first = await service.index('index.md' as NormalizedPath, [asset]);
        const second = await service.index('index.md' as NormalizedPath, [asset]);

        expect(first.get('page.md' as NormalizedPath)).toEqual(new Set(['page', 'included']));
        expect(second.get('page.md' as NormalizedPath)).toEqual(new Set(['page', 'included']));
        expect(transform).toHaveBeenCalledTimes(1);

        const mixed = await service.index('index.md' as NormalizedPath, [
            {...asset, search: '?version=v25.1'},
            {...asset, search: '?mode=compact'},
        ]);
        expect(mixed.get('page.md' as NormalizedPath)).toEqual(new Set(['page', 'included']));
        expect(transform).toHaveBeenCalledTimes(1);

        Object.assign(run.markdown, {revision: 1});
        graph.content = '# Updated';
        const updated = await service.index('index.md' as NormalizedPath, [asset]);
        expect(updated.get('page.md' as NormalizedPath)).toEqual(new Set(['updated', 'included']));
        expect(transform).toHaveBeenCalledTimes(2);

        Object.assign(run.markdown, {revision: 2});
        graph.deps[0].content = '## Revised';
        const revised = await service.index('index.md' as NormalizedPath, [asset]);
        expect(revised.get('page.md' as NormalizedPath)).toEqual(new Set(['updated', 'revised']));
        expect(transform).toHaveBeenCalledTimes(3);
    });

    it('does not cache a failed render so a later lookup can retry', async () => {
        const graph: EntryGraph = {
            path: 'page.md' as NormalizedPath,
            content: '# Page',
            deps: [],
            assets: [],
        };
        const transform = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockImplementationOnce(
                async (
                    _path: NormalizedPath,
                    _content: string,
                    options: {anchorIds?: Set<string>},
                ) => {
                    options.anchorIds?.add('page');
                    return ['', {}] as const;
                },
            );
        const run = {
            input,
            exists: (path: string) => path === join(input, 'page.md'),
            toc: {entrySet: new Set(['page.md'])},
            markdown: {revision: 0, graph: vi.fn(async () => graph)},
            transform,
        } as unknown as Run;
        const service = new AnchorsService(run);
        const asset: AssetInfo = {
            path: 'page.md' as NormalizedPath,
            type: 'link',
            subtype: null,
            title: 'Page',
            autotitle: false,
            location: [0, 1],
            hash: '#page',
            search: null,
        };

        await expect(service.index('index.md' as NormalizedPath, [asset])).rejects.toThrow('boom');

        const retried = await service.index('index.md' as NormalizedPath, [asset]);

        expect(retried.get('page.md' as NormalizedPath)).toEqual(new Set(['page']));
        expect(transform).toHaveBeenCalledTimes(2);
    });
});
