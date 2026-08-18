import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {parse} from '~/commands/parser';

import {SeedStore, seedFilePath} from '../providers/ai/utils';
import {loadTranslationUnits} from '../utils';
import {Run} from '../run';

import {Seed} from './seed';

function project(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'yfm-seed-command-')) as AbsolutePath;
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), {recursive: true});
        writeFileSync(join(dir, path), content);
    }
    return dir;
}

async function runSeed(argv: string, files: string[]) {
    const seed = new Seed();

    vi.spyOn(Run.prototype, 'prepareRun').mockImplementation(async () => undefined);
    vi.spyOn(Run.prototype, 'getFiles').mockResolvedValue([files, []]);

    const rawArgs = ['node', 'index'].concat(argv.split(' '));
    const args = parse(rawArgs, 'seed');

    await seed.init(args);
    await seed.parse(rawArgs);

    return seed;
}

describe('Translate.Seed command', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should seed the cache from CLI arguments', async () => {
        const input = project({
            'ru/article.md': 'Первое. Второе.\n',
            'en/article.md': 'First. Second.\n',
            'ru/drift.md': 'Одно.\n',
            'en/drift.md': 'One. Extra.\n',
        });
        const cacheDir = mkdtempSync(join(tmpdir(), 'yfm-seed-command-cache-')) as AbsolutePath;

        await runSeed(`-i ${input} --source ru --target en --cache-dir ${cacheDir}`, [
            'ru/article.md',
            'ru/drift.md',
        ]);

        const seeds = new SeedStore(seedFilePath(cacheDir, 'ru', 'en'));
        seeds.load();

        const {units} = await loadTranslationUnits({
            inputPath: join(input, 'ru/article.md') as AbsolutePath,
            path: 'ru/article.md',
            sourceLanguage: 'ru',
            targetLanguage: 'en',
            vars: {},
        });

        expect(seeds.get(units[0])).toContain('First.');
        expect(seeds.get(units[1])).toContain('Second.');

        // The drifted file is skipped, so its units are not in the store.
        const drifted = await loadTranslationUnits({
            inputPath: join(input, 'ru/drift.md') as AbsolutePath,
            path: 'ru/drift.md',
            sourceLanguage: 'ru',
            targetLanguage: 'en',
            vars: {},
        });

        expect(seeds.get(drifted.units[0])).toBeUndefined();
    });

    it('should require the --cache-dir option', async () => {
        const input = project({
            'ru/article.md': 'Первое.\n',
        });

        await expect(
            runSeed(`-i ${input} --source ru --target en`, ['ru/article.md']),
        ).rejects.toThrow('--cache-dir');
    });
});
