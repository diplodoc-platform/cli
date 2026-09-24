import type {TranslateLogger} from '../logger';
import type {AITranslationConfig} from '../providers/ai';
import type {LLMClient} from '../providers/ai/clients/types';
import type {Defer} from '../providers/ai/utils';

import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import {Provider, makeStore, makeTranslator} from '../providers/ai/provider';
import {FRAGMENT_SEPARATOR, splitFragments} from '../providers/ai/prompts';
import {SeedStore, seedFilePath} from '../providers/ai/utils';
import {createTargetStat} from '../report';
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
                'ru/empty.md': '',
                'en/empty.md': '',
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                // The empty file has nothing to seed and is silently passed by.
                files: ['ru/article.md', 'ru/empty.md'],
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

        it('should not seed files whose translation does not align at all', async () => {
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
            expect(stats.partial).toEqual([]);
        });

        it('should seed the aligned blocks of a partially diverged translation', async () => {
            const input = project({
                'ru/drift.md': '# Заголовок\n\nПервое. Второе.\n\n- Пункт\n',
                'en/drift.md': '# Title\n\nFirst and second.\n\n- Item\n',
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

            expect(stats.seededFiles).toBe(1);
            expect(stats.seededUnits).toBe(2);
            expect(stats.unseededUnits).toBe(2);
            expect(stats.partial).toEqual([{file: 'ru/drift.md', unseeded: 2, units: 4}]);
            expect(stats.mismatched).toEqual([]);

            const seeds = loadSeeds(cacheDir);
            const {units} = await loadTranslationUnits({
                inputPath: join(input, 'ru/drift.md') as AbsolutePath,
                path: 'ru/drift.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            expect(seeds.get(units[0])).toContain('Title');
            expect(seeds.get(units[1])).toBeUndefined();
            expect(seeds.get(units[2])).toBeUndefined();
            expect(seeds.get(units[3])).toContain('Item');
        });

        it('should seed the unchanged blocks of a source that gained a section', async () => {
            // The usual caller seeds the trunk state after the change is
            // merged: the source already has the new section, the
            // translation does not. Everything else must still be seeded.
            const input = project({
                'ru/notes.md': [
                    '# Релизы',
                    '',
                    '{% cut "**2.11.1**" %}',
                    '',
                    '**Дата релиза:** 2026-08-25',
                    '',
                    '- Новая возможность',
                    '- Поддержка `schema_hint`',
                    '',
                    '{% endcut %}',
                    '',
                    '{% cut "**2.11.0**" %}',
                    '',
                    '**Дата релиза:** 2026-07-31',
                    '',
                    '- Поддержка Spark 4.2',
                    '- Прочие исправления',
                    '',
                    '{% endcut %}',
                    '',
                ].join('\n'),
                'en/notes.md': [
                    '# Releases',
                    '',
                    '{% cut "**2.11.0**" %}',
                    '',
                    '**Release date:** 2026-07-31',
                    '',
                    '- Spark 4.2 support',
                    '- Other fixes',
                    '',
                    '{% endcut %}',
                    '',
                ].join('\n'),
            });
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/notes.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.seededUnits).toBe(5);
            expect(stats.partial).toEqual([{file: 'ru/notes.md', unseeded: 4, units: 9}]);

            const seeds = loadSeeds(cacheDir);
            const {units} = await loadTranslationUnits({
                inputPath: join(input, 'ru/notes.md') as AbsolutePath,
                path: 'ru/notes.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });
            const seeded = units.map((unit) => seeds.get(unit) !== undefined);

            // Heading and the 2.11.0 section are seeded, the 2.11.1 section is not.
            expect(seeded).toEqual([true, false, false, false, false, true, true, true, true]);
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

            const stat = createTargetStat();
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

        it('should keep the wording of a sentence repeated with different translations', async () => {
            const input = project({
                'ru/notes.md': [
                    '# Релизы',
                    '',
                    '## 2.2',
                    '',
                    'Новая секция.',
                    '',
                    '## 2.1',
                    '',
                    'Сопроводительный релиз.',
                    '',
                    '## 2.0',
                    '',
                    'Сопроводительный релиз.',
                    '',
                    '## 1.9',
                    '',
                    'Сопроводительный релиз.',
                    '',
                ].join('\n'),
                'en/notes.md': [
                    '# Releases',
                    '',
                    '## 2.1',
                    '',
                    'Maintenance release.',
                    '',
                    '## 2.0',
                    '',
                    'Bugfix release.',
                    '',
                    '## 1.9',
                    '',
                    'Maintenance release.',
                    '',
                ].join('\n'),
            });
            const cacheDir = cache();

            await seedTranslations({
                input,
                files: ['ru/notes.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            const client: LLMClient = {
                name: 'fake',
                // The instructions quote the delimiter once, the fragments
                // follow it: everything after the first delimiter is payload.
                complete: vi.fn(async (messages: {content: string}[]) => ({
                    text: splitFragments(messages[messages.length - 1].content)
                        .slice(1)
                        .map((part) => (part.includes('Новая секция.') ? 'New section.' : '2.2'))
                        .join(`\n${FRAGMENT_SEPARATOR}\n`),
                })),
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
            const translate = makeTranslator({
                client,
                config,
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                cache: new Map<string, Defer>(),
                store,
                stat: createTargetStat(),
                logger: {warn: vi.fn(), request: vi.fn()} as unknown as TranslateLogger,
            });

            const {units} = await loadTranslationUnits({
                inputPath: join(input, 'ru/notes.md') as AbsolutePath,
                path: 'ru/notes.md',
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
            });

            const parts = await translate('ru/notes.md', units);
            const texts = parts.map((part) => part.replace(/<[^>]+>/g, ''));

            // Only the new section reaches the model; every repeated sentence
            // keeps the wording it had at its place, not the majority one.
            expect(client.complete).toHaveBeenCalledTimes(1);
            expect(texts).toEqual([
                'Releases',
                '2.2',
                'New section.',
                '2.1',
                'Maintenance release.',
                '2.0',
                'Bugfix release.',
                '1.9',
                'Maintenance release.',
            ]);
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

    describe('localized translations', () => {
        const ru = [
            '# Календарь {#calendar}',
            '',
            'О реформе читайте в [статье вики](https://ru.example.org/wiki/Григорианский_календарь). Второе предложение.',
            '',
            'Откройте меню:',
            '',
            '```',
            'Настройки - Эксперименты - Отладка плагинов',
            '```',
            '',
            '## Что дальше',
            '',
            'Смотрите [документацию](https://docs.example.com/docs/ru/admin-guide/gpu).',
            '',
        ].join('\n');
        const en = [
            '# Calendar {#calendar}',
            '',
            'Read about the reform in the [wiki article](https://en.example.org/wiki/Adoption_of_the_Gregorian_calendar). The second sentence.',
            '',
            'Open the menu:',
            '',
            '```',
            'Settings - Experiments - Plugin debugging',
            '```',
            '',
            '## What next {#see-also}',
            '',
            'See the [documentation](https://docs.example.com/docs/en/admin-guide/gpu).',
            '',
        ].join('\n');

        async function translate(input: AbsolutePath, cacheDir: AbsolutePath, answers: Hash) {
            const output = mkdtempSync(join(tmpdir(), 'yfm-seed-out-'));
            const requests: string[] = [];
            const client: LLMClient = {
                name: 'fake',
                complete: vi.fn(async (messages) => {
                    const fragments = splitFragments(messages[messages.length - 1].content);
                    requests.push(...fragments);
                    return {
                        text: fragments
                            .map((text) => answers[text] ?? `T:${text}`)
                            .join(`\n${FRAGMENT_SEPARATOR}\n`),
                    };
                }),
            };
            const warn = vi.fn();
            const provider = new Provider(() => client, {} as never);
            Object.assign(provider, {
                logger: {
                    translate: vi.fn(),
                    translated: vi.fn(),
                    request: vi.fn(),
                    stat: vi.fn(),
                    warn,
                    error: vi.fn(),
                    info: vi.fn(),
                },
            });

            await provider.translate(['ru/page.md'], {
                input,
                output,
                source: {language: 'ru', locale: 'RU'},
                target: [{language: 'en', locale: 'US'}],
                vars: {},
                dryRun: false,
                model: 'fake',
                cacheDir,
                memoryHints: false,
                userPrompt: '{{fragments}}',
                promptMode: 'append',
                glossaryPairs: [],
                temperature: 0,
                maxOutputTokens: 200,
                maxBatchTokens: 200,
                maxConcurrency: 1,
                retry: 0,
            } as unknown as AITranslationConfig);

            return {page: readFileSync(join(output, 'en/page.md'), 'utf8'), requests, warn};
        }

        it('should change only the edited sentence of a localized page', async () => {
            const input = project({'ru/page.md': ru, 'en/page.md': en});
            const cacheDir = cache();

            const stats = await seedTranslations({
                input,
                files: ['ru/page.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            expect(stats.partial).toEqual([]);
            expect(stats.skeletonFragments).toBe(2);

            writeFileSync(
                join(input, 'ru/page.md'),
                ru.replace('Второе предложение.', 'Второе предложение изменилось.'),
            );

            const {page, requests, warn} = await translate(input, cacheDir, {
                'Второе предложение изменилось.': 'The second sentence changed.',
            });

            expect(requests).toEqual(['Второе предложение изменилось.']);
            expect(page).toBe(en.replace('The second sentence.', 'The second sentence changed.'));
            expect(warn).not.toHaveBeenCalled();
        });

        it('should report what the source changed under the localized fragments', async () => {
            const input = project({'ru/page.md': ru, 'en/page.md': en});
            const cacheDir = cache();

            await seedTranslations({
                input,
                files: ['ru/page.md'],
                sourceLanguage: 'ru',
                targetLanguage: 'en',
                vars: {},
                cacheDir,
            });

            writeFileSync(
                join(input, 'ru/page.md'),
                ru
                    .replace('Отладка плагинов', 'Отладка расширений')
                    .replace('## Что дальше', '## Что почитать')
                    .replace('О реформе читайте', 'Подробнее о реформе читайте'),
            );

            const {page, warn} = await translate(input, cacheDir, {});

            // The changed code block and heading come from the source; the
            // changed sentence went to the model and kept the source link.
            expect(page).toContain('Настройки - Эксперименты - Отладка расширений');
            expect(page).not.toContain('{#see-also}');
            expect(warn).toHaveBeenCalledWith(
                'ru/page.md',
                'Existing translation localized 1 code block and heading ids or link ' +
                    'addresses in 1 line the source has changed since; the output takes ' +
                    'them from the source.',
            );
            expect(warn).toHaveBeenCalledWith(
                'ru/page.md',
                'Existing translation localized 1 link the output takes from the source ' +
                    'again, e.g. https://ru.example.org/wiki/Григорианский_календарь ' +
                    'instead of https://en.example.org/wiki/Adoption_of_the_Gregorian_calendar.',
            );
        });
    });
});
