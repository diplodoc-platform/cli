import type * as translateUtils from '../utils';

import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {SeedStore, seedFilePath} from '../providers/ai/utils';

import {seedTranslations} from './seed';

vi.mock('../utils', async (importOriginal) => {
    const original = (await importOriginal()) as typeof translateUtils;
    return {
        ...original,
        loadTranslationUnits: vi.fn(async (params: {inputPath: string}) => {
            if (params.inputPath.includes('broken')) {
                throw new Error('Unable to extract valid tokens for text segment.');
            }
            return original.loadTranslationUnits(
                params as Parameters<typeof original.loadTranslationUnits>[0],
            );
        }),
    };
});

function project(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'yfm-seed-failure-')) as AbsolutePath;
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), {recursive: true});
        writeFileSync(join(dir, path), content);
    }
    return dir;
}

describe('translate seed', () => {
    describe('seedTranslations per-file failures', () => {
        it('should report extraction failures without killing the run', async () => {
            const input = project({
                'ru/ok.md': 'Первое.\n',
                'en/ok.md': 'First.\n',
                'ru/broken.md': 'Текст.\n',
                'en/broken.md': 'Text.\n',
            });
            const cacheDir = mkdtempSync(join(tmpdir(), 'yfm-seed-failure-cache-')) as AbsolutePath;

            const stats = await seedTranslations({
                input,
                files: ['ru/ok.md', 'ru/broken.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            // The broken file is reported and skipped; the healthy file is
            // still seeded and the seed store is flushed.
            expect(stats.failed).toHaveLength(1);
            expect(stats.failed[0][0]).toBe('ru/broken.md');
            expect(stats.failed[0][1]).toContain('Unable to extract valid tokens');
            expect(stats.seededFiles).toBe(1);
            expect(stats.seededUnits).toBe(1);

            const seeds = new SeedStore(seedFilePath(cacheDir, 'ru', 'en'));
            seeds.load();
            expect(seeds.get('<source xml:space="preserve">Первое.</source>')).toBe(
                '<source xml:space="preserve">First.</source>',
            );
        });
    });
});
