import {afterEach, describe, expect, it, vi} from 'vitest';

import {setupRun} from '~/commands/build/__tests__';
import {normalizePath} from '~/core/utils';

const readers = ['deps', 'graph', 'assets', 'headings', 'relations'] as const;

afterEach(() => vi.restoreAllMocks());

function setupGraph(edges: Record<string, string[]>) {
    const run = setupRun({});
    const service = run.markdown;
    const load = vi.spyOn(service, 'load').mockResolvedValue('Body.');
    vi.spyOn(service['pathToDeps'], 'get').mockImplementation((key) =>
        (edges[key.split('+')[0]] || []).map((path, index) => ({
            path: normalizePath(path),
            link: path,
            match: path,
            location: [index, index + 1],
            hash: null,
            search: null,
        })),
    );
    vi.spyOn(run.meta, 'get').mockReturnValue({});

    return {service, load};
}

describe('recursive include readers', () => {
    it.each(readers)('%s rejects the active cycle with the complete chain', async (reader) => {
        const {service, load} = setupGraph({'root.md': ['part.md'], 'part.md': ['root.md']});

        await expect(service[reader](normalizePath('root.md'))).rejects.toThrow(
            'Circular includes: root.md ▶ part.md ▶ root.md',
        );
        expect(load).toHaveBeenCalledTimes(2);
    });

    it.each(readers)('%s preserves diamond and repeated sibling includes', async (reader) => {
        const {service, load} = setupGraph({
            'root.md': ['left.md', 'right.md', 'left.md'],
            'left.md': ['shared.md'],
            'right.md': ['shared.md'],
        });

        const result = await service[reader](normalizePath('root.md'));

        expect(result).toBeDefined();
        expect(load.mock.calls.filter(([path]) => path === 'shared.md')).toHaveLength(3);
        expect(load).toHaveBeenCalledWith('shared.md', 'root.md');
        if (reader === 'deps') {
            expect(result).toHaveLength(6);
        }
    });
});
