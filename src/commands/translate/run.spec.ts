import type {Run} from './run';

import {cpSync, mkdtempSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {parse} from '~/commands/parser';

import {Seed} from './commands/seed';

const FIXTURE = resolve(__dirname, '../../../tests/mocks/translation/toc-include-link/input');

/**
 * Drives the real `translate seed` program on a copy of the fixture so that
 * `Run` gets the same config and toc graph as in production, then returns
 * the run for direct `getFiles` calls.
 */
async function prepare() {
    // Resolve symlinks and 8.3 short names (/var -> /private/var on macOS,
    // RUNNER~1 on Windows) up front: the run checks file scopes against
    // real paths, and only the native realpath expands short names.
    const input = realpathSync.native(
        mkdtempSync(join(tmpdir(), 'yfm-translate-run-')),
    ) as AbsolutePath;
    const cacheDir = mkdtempSync(join(tmpdir(), 'yfm-translate-run-cache-'));
    cpSync(FIXTURE, join(input, 'ru'), {recursive: true});

    const rawArgs = ['node', 'index', '-i', input, '--source', 'ru', '--target', 'es'];
    rawArgs.push('--cache-dir', cacheDir);

    const seed = new Seed();
    await seed.init(parse(rawArgs, 'seed'));
    await seed.parse(rawArgs);

    return (seed as unknown as {run: Run}).run;
}

async function files(run: Run, options?: Parameters<Run['getFiles']>[0]) {
    const [list] = await run.getFiles(options);

    return list.map((file) => file.replace(/\\/g, '/')).sort();
}

describe('Translate Run.getFiles', () => {
    let run: Run;

    afterEach(() => {
        run = undefined as unknown as Run;
    });

    it('lists include-consumed tocs for commands that read files as they are', async () => {
        run = await prepare();

        // The parent toc keeps its `include` entries on disk, so the included
        // tocs need translations of their own.
        expect(await files(run)).toEqual([
            'ru/api/common/thing.md',
            'ru/api/common/toc.yaml',
            'ru/api/index.md',
            'ru/api/toc.yaml',
            'ru/index.md',
            'ru/toc.yaml',
        ]);
    });

    it('hides include-consumed tocs when the caller inlines includes', async () => {
        run = await prepare();

        // `extract` loads tocs through `getFileContent`, which inlines the
        // included tocs into the parent, so they must not be listed twice.
        expect(await files(run, {inlinedTocs: true})).toEqual([
            'ru/api/common/thing.md',
            'ru/api/index.md',
            'ru/index.md',
            'ru/toc.yaml',
        ]);
    });
});
