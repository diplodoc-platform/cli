import type {Snapshot} from './types';

import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterEach, expect, it} from 'vitest';

import {executeUpdates} from './execute';
const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});
it('writes independent successful files and reports conflicts without creating their outputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'update-output-'));
    roots.push(root);
    await mkdir(join(root, 'en'));
    const good: Snapshot = {
        entry: {
            kind: 'update',
            sourcePath: 'ru/a.md',
            targetPath: 'en/a.md',
            sourceBeforePath: 'b',
            sourceAfterPath: 'a',
            targetBeforePath: 't',
        },
        sourceBefore: '# Старое',
        sourceAfter: '# Новое',
        targetBefore: '# Previous\n\nHuman',
    };
    const bad: Snapshot = {
        ...good,
        entry: {...good.entry, sourcePath: 'ru/b.md', targetPath: 'en/b.md'},
        sourceBefore: 'Старое',
        sourceAfter: 'Новое',
    };
    const results = await executeUpdates([good, bad], root, false, async () => ({
        text: '# New',
        diagnostics: [],
    }));
    expect(await fs.readFile(resolve(root, 'en/a.md'), 'utf8')).toBe('# New\n\nHuman');
    await expect(fs.readFile(resolve(root, 'en/b.md'), 'utf8')).rejects.toThrow();
    expect(results.map((result) => result.applied)).toEqual([1, 0]);
    expect(results[1].diagnostics).not.toEqual([]);
});
it('dry-run plans without calling a provider or writing files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'update-dry-'));
    roots.push(root);
    let calls = 0;
    const entry: Snapshot = {
        entry: {
            kind: 'update',
            sourcePath: 'ru/a.md',
            targetPath: 'en/a.md',
            sourceBeforePath: 'b',
            sourceAfterPath: 'a',
            targetBeforePath: 't',
        },
        sourceBefore: '# Старое',
        sourceAfter: '# Новое',
        targetBefore: '# Previous',
    };
    const results = await executeUpdates([entry], root, true, async () => {
        calls++;
        return {text: '# New', diagnostics: []};
    });
    expect(calls).toBe(0);
    expect(results[0]).toMatchObject({planned: 1, applied: 0});
    await expect(fs.readFile(resolve(root, 'en/a.md'), 'utf8')).rejects.toThrow();
});

it.each(['update', 'create'] as const)(
    'does not overwrite a %s destination changed during translation',
    async (kind) => {
        const root = await mkdtemp(join(tmpdir(), 'update-race-'));
        roots.push(root);
        await mkdir(join(root, 'en'));
        const entry: Snapshot =
            kind === 'update'
                ? {
                      entry: {
                          kind,
                          sourcePath: 'ru/a.md',
                          targetPath: 'en/a.md',
                          sourceBeforePath: 'b',
                          sourceAfterPath: 'a',
                          targetBeforePath: 't',
                      },
                      sourceBefore: '# Старое',
                      sourceAfter: '# Новое',
                      targetBefore: '# Previous',
                  }
                : {
                      entry: {
                          kind,
                          sourcePath: 'ru/a.md',
                          targetPath: 'en/a.md',
                          sourceAfterPath: 'a',
                      },
                      sourceBefore: null,
                      sourceAfter: '# Новое',
                      targetBefore: null,
                  };
        const change = async () => {
            await fs.writeFile(join(root, 'en/a.md'), 'Human edit after snapshot');
            return '# Translated';
        };
        const results = await executeUpdates(
            [entry],
            root,
            false,
            async () => ({text: await change(), diagnostics: []}),
            change,
        );
        expect(await fs.readFile(resolve(root, 'en/a.md'), 'utf8')).toBe(
            'Human edit after snapshot',
        );
        expect(results[0].applied).toBe(0);
        expect(results[0].diagnostics.length).toBeGreaterThan(0);
    },
);

it('does not restore an old snapshot for a zero-change plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'update-stale-'));
    roots.push(root);
    await mkdir(join(root, 'en'));
    await fs.writeFile(join(root, 'en/a.md'), 'Human edit');
    const entry: Snapshot = {
        entry: {
            kind: 'update',
            sourcePath: 'ru/a.md',
            targetPath: 'en/a.md',
            sourceBeforePath: 'b',
            sourceAfterPath: 'a',
            targetBeforePath: 't',
        },
        sourceBefore: '# Same',
        sourceAfter: '# Same',
        targetBefore: '# Old target',
    };
    await executeUpdates([entry], root, false, async () => ({text: '# Wrong', diagnostics: []}));
    expect(await fs.readFile(resolve(root, 'en/a.md'), 'utf8')).toBe('Human edit');
});
