import type {LoaderContext} from '~/core/markdown/loader';

import {describe, expect, it, vi} from 'vitest';

import {createCollect} from './collect';

function context(readFile: LoaderContext['readFile'], path = 'index.md') {
    return {
        path,
        readFile,
        logger: {warn: vi.fn(), error: vi.fn()},
        api: {codeSources: {set: vi.fn()}},
    } as unknown as LoaderContext;
}

function readSource(read: () => Promise<string>) {
    return vi.fn(async (path: string) => {
        if (path !== 'example.ts') {
            throw Object.assign(new Error('not found'), {code: 'ENOENT'});
        }
        return read();
    });
}

describe('code source cache', () => {
    it('shares concurrent reads across pages and different regions of one file', async () => {
        const read = readSource(
            async () => '// #region a\nfirst\n// #endregion\n// [START b]\nsecond\n// [END b]',
        );
        const collect = createCollect();
        const first = context(read);
        const second = context(read, 'other.md');
        const outputs = await Promise.all([
            collect.call(first, `{% code '/example.ts#a' %}`, {}),
            collect.call(second, `{% code '/example.ts#b' %}`, {}),
        ]);
        expect(outputs).toEqual(['```\nfirst\n```', '```\nsecond\n```']);
        expect(read).toHaveBeenCalledTimes(3);
        expect(read.mock.calls.filter(([path]) => path === 'example.ts')).toHaveLength(1);
        expect(second.api.codeSources.set).toHaveBeenCalledWith(['example.ts#b', 'example.ts']);
    });

    it('discards reads and indexes after a Markdown revision change', async () => {
        let revision = 0;
        const read = vi
            .fn()
            .mockResolvedValueOnce('// #region r\nold\n// #endregion')
            .mockResolvedValueOnce('// #region r\nnew\n// #endregion');
        const collect = createCollect(() => revision);
        const loader = context(readSource(read));
        const source = `{% code './example.ts#r' %}`;
        expect(await collect.call(loader, source, {})).toBe('```\nold\n```');
        expect(await collect.call(loader, source, {})).toBe('```\nold\n```');
        revision++;
        expect(await collect.call(loader, source, {})).toBe('```\nnew\n```');
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('does not leak cached files into a separate build run', async () => {
        const read = vi
            .fn()
            .mockResolvedValueOnce('// #region r\nold\n// #endregion')
            .mockResolvedValueOnce('// #region r\nnew\n// #endregion');
        const loader = context(readSource(read));
        const source = `{% code './example.ts#r' %}`;
        expect(await createCollect().call(loader, source, {})).toContain('old');
        expect(await createCollect().call(loader, source, {})).toContain('new');
    });

    it('retries failed reads and recovers from a malformed file after invalidation', async () => {
        let revision = 0;
        const read = vi
            .fn()
            .mockRejectedValueOnce(new Error('unavailable'))
            .mockResolvedValueOnce('// #region r\nold')
            .mockResolvedValueOnce('// #region r\nnew\n// #endregion');
        const collect = createCollect(() => revision);
        const loader = context(readSource(read));
        const source = `{% code './example.ts#r' %}`;
        expect(await collect.call(loader, source, {})).toContain('failed');
        expect(await collect.call(loader, source, {})).toContain('failed');
        expect(await collect.call(loader, source, {})).toContain('failed');
        expect(read).toHaveBeenCalledTimes(2);
        revision++;
        expect(await collect.call(loader, source, {})).toBe('```\nnew\n```');
        expect(read).toHaveBeenCalledTimes(3);
    });

    it.each(['ENOENT', 'ENOTDIR', 'EISDIR', 'ENAMETOOLONG'])(
        'caches missing literal candidates reported as %s',
        async (code) => {
            const read = vi.fn(async (path: string) => {
                if (path === 'example.ts#r') {
                    throw Object.assign(new Error('not a file'), {code});
                }
                return '// #region r\nregion();\n// #endregion';
            });
            const collect = createCollect();
            const outputs = await Promise.all([
                collect.call(context(read), `{% code './example.ts#r' %}`, {}),
                collect.call(context(read, 'other.md'), `{% code './example.ts#r' %}`, {}),
            ]);
            expect(outputs).toEqual(['```\nregion();\n```', '```\nregion();\n```']);
            expect(read).toHaveBeenCalledTimes(2);
        },
    );

    it('does not fall back on permission errors and retries transient literal reads', async () => {
        const read = vi
            .fn()
            .mockRejectedValueOnce(Object.assign(new Error('denied'), {code: 'EACCES'}))
            .mockResolvedValueOnce('literal();');
        const loader = context(read);
        const collect = createCollect();
        const directive = `{% code './example.ts#r' %}`;
        expect(await collect.call(loader, directive, {})).toContain('failed');
        expect(await collect.call(loader, directive, {})).toBe('```\nliteral();\n```');
        expect(read).toHaveBeenCalledTimes(2);
        expect(read).not.toHaveBeenCalledWith('example.ts');
    });

    it.each(['./example.ts', './example.ts#r'])(
        'still reports an overlong actual source as a read error: %s',
        async (path) => {
            const read = vi
                .fn()
                .mockRejectedValue(Object.assign(new Error('too long'), {code: 'ENAMETOOLONG'}));
            const loader = context(read);
            expect(await createCollect().call(loader, `{% code '${path}' %}`, {})).toContain(
                'failed',
            );
            expect(loader.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('file could not be read: "./example.ts"'),
            );
        },
    );
});
