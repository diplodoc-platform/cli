import type {Run} from '../../run';
import type {AssetInfo, EntryGraph} from '~/core/markdown';

import {describe, expect, it, vi} from 'vitest';

import {AnchorsService} from './AnchorsService';

describe('AnchorsService', () => {
    it('resolves Markdown pages, extensionless paths, directories, and queries', () => {
        const existing = new Set([
            '/input/page.md',
            '/input/guide/index.md',
            '/input/leading/index.yaml',
        ]);
        const service = new AnchorsService({
            input: '/input',
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

    it('caches rendered anchors until page or include content changes', async () => {
        const graph: EntryGraph = {
            path: 'page.md' as NormalizedPath,
            content: '# Page',
            deps: [],
            assets: [],
        };
        const transform = vi.fn(
            async (_path: NormalizedPath, content: string, options: {anchorIds?: Set<string>}) => {
                options.anchorIds?.add(content.includes('Updated') ? 'updated' : 'page');
                return ['', {}] as const;
            },
        );
        const run = {
            input: '/input',
            exists: (path: string) => path === '/input/page.md',
            toc: {entries: ['page.md']},
            markdown: {graph: vi.fn(async () => graph)},
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

        expect(first.get('page.md' as NormalizedPath)).toEqual(new Set(['page']));
        expect(second.get('page.md' as NormalizedPath)).toEqual(new Set(['page']));
        expect(transform).toHaveBeenCalledTimes(1);

        graph.content = '# Updated';
        const updated = await service.index('index.md' as NormalizedPath, [asset]);

        expect(updated.get('page.md' as NormalizedPath)).toEqual(new Set(['updated']));
        expect(transform).toHaveBeenCalledTimes(2);
    });
});
