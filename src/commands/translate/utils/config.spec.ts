import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {resolveFiles} from './config';

const dirs: string[] = [];

function makeProject(files: string[]) {
    const root = mkdtempSync(join(tmpdir(), 'yfm-resolve-files-'));
    dirs.push(root);

    for (const file of files) {
        mkdirSync(join(root, dirname(file)), {recursive: true});
        writeFileSync(join(root, file), '');
    }

    return root;
}

afterEach(() => {
    while (dirs.length) {
        rmSync(dirs.pop() as string, {recursive: true, force: true});
    }
});

describe('resolveFiles', () => {
    it('keeps files matched by any of multiple include patterns', () => {
        const root = makeProject(['ru/a.md', 'ru/b.md', 'ru/c.md']);

        const [result] = resolveFiles(
            root,
            null,
            ['ru/a.md', 'ru/b.md'],
            [],
            'ru',
            ['.md', '.yaml'],
            null,
        );

        expect(result.sort()).toEqual(['ru/a.md', 'ru/b.md']);
    });

    it('applies exclude to included files', () => {
        const root = makeProject(['ru/a.md', 'ru/b.md']);

        const [result] = resolveFiles(
            root,
            null,
            ['ru/a.md', 'ru/b.md'],
            ['ru/b.md'],
            'ru',
            ['.md', '.yaml'],
            null,
        );

        expect(result).toEqual(['ru/a.md']);
    });
});
