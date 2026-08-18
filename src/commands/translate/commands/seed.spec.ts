import type {TranslateLogger} from '../logger';
import type {AITranslationConfig} from '../providers/ai';
import type {LLMClient} from '../providers/ai/clients/types';
import type {Defer} from '../providers/ai/utils';

import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {makeStore, makeTranslator} from '../providers/ai/provider';
import {SeedStore, seedFilePath} from '../providers/ai/utils';
import {loadTranslationUnits} from '../utils';

import {seedTranslations} from './seed';

function project(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'yfm-translate-seed-')) as AbsolutePath;
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), {recursive: true});
        writeFileSync(join(dir, path), content);
    }
    return dir;
}

function loadSeeds(cacheDir: AbsolutePath) {
    const seeds = new SeedStore(seedFilePath(cacheDir, 'ru', 'en'));
    seeds.load();
    return seeds;
}

const cache = () => mkdtempSync(join(tmpdir(), 'yfm-seed-cache-')) as AbsolutePath;

describe('translate seed', () => {
    describe('seedTranslations', () => {
        it('should seed pairs from aligned source and target files', async () => {
            const input = project({
                'ru/article.md': '# Заголовок\n\nПервое. Второе.\n',
                'en/article.md': '# Title\n\nFirst. Second.\n',
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/article.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.seededFiles).toBe(1);
            expect(stats.seededUnits).toBe(3);
            expect(stats.mismatched).toEqual([]);
            expect(stats.missingTargets).toEqual([]);

            const seeds = loadSeeds(cacheDir);
            const {units} = await loadTranslationUnits({
                inputPath: join(input, 'ru/article.md') as AbsolutePath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            expect(seeds.get(units[0])).toContain('Title');
            expect(seeds.get(units[1])).toContain('First.');
            expect(seeds.get(units[2])).toContain('Second.');
        });

        it('should report files without an existing translation', async () => {
            const input = project({
                'ru/new.md': 'Новый файл.\n',
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/new.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.seededFiles).toBe(0);
            expect(stats.missingTargets).toEqual(['ru/new.md']);
        });

        it('should not seed files whose unit counts diverge', async () => {
            const input = project({
                'ru/drift.md': 'Первое. Второе.\n',
                'en/drift.md': 'First. Second. Third.\n',
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/drift.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.seededFiles).toBe(0);
            expect(stats.seededUnits).toBe(0);
            expect(stats.mismatched).toEqual(['ru/drift.md']);
        });

        it('should let a translate run reuse seeds without calling the LLM', async () => {
            const input = project({
                'ru/article.md': '# Заголовок\n\nПервое. Второе.\n',
                'en/article.md': '# Title\n\nFirst. Second.\n',
            });
            const cacheDir = cache();

            await seedTranslations({
                input,
                files: ['ru/article.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            const client: LLMClient = {
                name: 'fake',
                complete: vi.fn(async () => {
                    throw new Error('the LLM must not be called for seeded units');
                }),
            };
            const config = {
                cacheDir,
                model: 'model',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 100,
                maxBatchTokens: 2000,
                maxConcurrency: 2,
                retry: 0,
                dryRun: false,
            } as unknown as AITranslationConfig;

            const store = makeStore(client, config, 'ru', 'en');
            store?.load();

            const stat = {
                inputTokens: 0,
                outputTokens: 0,
                requests: 0,
                bytes: 0,
                cached: 0,
                untranslated: 0,
                fallbackRequests: 0,
            };
            const translate = makeTranslator({
                client,
                config,
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                cache: new Map<string, Defer>(),
                store,
                stat,
                logger: {warn: vi.fn(), request: vi.fn()} as unknown as TranslateLogger,
            });

            const {units} = await loadTranslationUnits({
                inputPath: join(input, 'ru/article.md') as AbsolutePath,
                path: 'ru/article.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            const parts = await translate('ru/article.md', units);

            expect(client.complete).not.toHaveBeenCalled();
            expect(stat.cached).toBe(units.length);
            expect(parts.join('\n')).toContain('Title');
            expect(parts.join('\n')).toContain('First.');
        });

        it('should skip untranslated leftovers instead of freezing them', async () => {
            const input = project({
                'ru/mixed.md': 'Переведённое. Забытое.\n',
                'en/mixed.md': 'Translated. Забытое.\n',
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/mixed.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.seededUnits).toBe(1);
            expect(stats.skippedUnits).toBe(1);
        });
    });
});
