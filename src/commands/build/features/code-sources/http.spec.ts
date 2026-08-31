import type {Run} from '~/commands/build';
import type {ResolvedSource} from './sources';

import {join} from 'node:path';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {permalink, readSourceFile} from './sources';

function source(extra: Partial<ResolvedSource> = {}): ResolvedSource {
    return {
        name: 'files',
        type: 'http',
        root: '/cache/files-abc' as AbsolutePath,
        base: '/cache/files-abc' as AbsolutePath,
        prefix: 'snippets',
        host: null,
        repo: null,
        url: 'https://storage.example.com/bucket',
        ref: null,
        commit: null,
        raw: null,
        link: null,
        vendored: false,
        ...extra,
    };
}

function harness({exists = false} = {}) {
    const written: Hash<string> = {};
    const renamed: [string, string][] = [];

    const run = {
        config: {},
        exists: vi.fn(() => exists),
        read: vi.fn(async () => 'body'),
        fs: {
            mkdir: vi.fn(async () => undefined),
            writeFile: vi.fn(async (path: string, content: string) => {
                written[path] = content;
            }),
            rename: vi.fn(async (from: string, to: string) => {
                renamed.push([from, to]);
            }),
            unlink: vi.fn(async () => undefined),
        },
    } as unknown as Run;

    return {run, written, renamed};
}

describe('http source reads', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => 'body',
            })),
        );
    });

    it('should download the file under the source url', async () => {
        const {run} = harness();

        await readSourceFile(run, source(), 'a/b.sql');

        expect(fetch).toHaveBeenCalledWith('https://storage.example.com/bucket/snippets/a/b.sql');
    });

    it('should write atomically, so parallel workers cannot tear the file', async () => {
        const {run, written, renamed} = harness();

        await readSourceFile(run, source(), 'b.sql');

        // Written to a temporary name, then renamed into place.
        const [[temp, target]] = renamed;
        expect(Object.keys(written)).toEqual([temp]);
        expect(temp).not.toBe(target);
        expect(target).toBe(join(source().root, 'b.sql'));
    });

    it('should skip the download when the file is already on disk', async () => {
        const {run} = harness({exists: true});

        await readSourceFile(run, source(), 'b.sql');

        expect(fetch).not.toHaveBeenCalled();
    });

    it('should report a failed response instead of caching an error page', async () => {
        const {run} = harness();
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ok: false, status: 404, statusText: 'Not Found'})),
        );

        await expect(readSourceFile(run, source(), 'gone.sql')).rejects.toThrow(/404/);
    });
});

describe('permalink by source type', () => {
    it('should link an http source straight at the file', () => {
        expect(permalink(source(), 'a/b.sql', 3, 9)).toBe(
            'https://storage.example.com/bucket/snippets/a/b.sql',
        );
    });

    it('should honour a custom link template', () => {
        const custom = source({
            type: 'git',
            ref: 'trunk',
            commit: 'abc123',
            link: '{url}/blame/{ref}/{path}?from={start}&to={end}',
        });

        expect(permalink(custom, 'a.sql', 3, 9)).toBe(
            'https://storage.example.com/bucket/blame/trunk/snippets/a.sql?from=3&to=9',
        );
    });

    it('should collapse the anchor for a single line', () => {
        const git = source({
            type: 'git',
            ref: 'main',
            commit: 'abc123',
            link: '{url}/blob/{commit}/{path}#{lines}',
        });

        expect(permalink(git, 'a.go', 7, 7)).toContain('#L7');
    });
});
