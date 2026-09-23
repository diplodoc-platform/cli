import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {SeedStore, TranslationStore, cacheFingerprint, seedFilePath} from './cache';

const tmpDir = () => mkdtempSync(join(tmpdir(), 'yfm-translate-cache-'));
const tmp = () => join(tmpDir(), 'store.json');

describe('translate ai cache', () => {
    describe('TranslationStore', () => {
        it('should persist translations between instances', () => {
            const file = tmp();
            const fingerprint = cacheFingerprint({model: 'a'});

            const first = new TranslationStore(file, fingerprint);
            first.load();
            first.set('Привет', 'Hello');
            first.flush();

            const second = new TranslationStore(file, fingerprint);
            second.load();

            expect(second.get('Привет')).toBe('Hello');
            expect(second.get('Другое')).toBeUndefined();
        });

        it('should reset the cache when the fingerprint changes', () => {
            const file = tmp();

            const first = new TranslationStore(file, cacheFingerprint({model: 'a'}));
            first.load();
            first.set('Привет', 'Hello');
            first.flush();

            const second = new TranslationStore(file, cacheFingerprint({model: 'b'}));
            second.load();

            expect(second.get('Привет')).toBeUndefined();
        });

        it('should survive a corrupted cache file', () => {
            const file = tmp();
            writeFileSync(file, 'not a json');

            const store = new TranslationStore(file, cacheFingerprint({}));

            expect(() => store.load()).not.toThrow();
            expect(store.get('Привет')).toBeUndefined();
        });

        it('should not write the file until something changes', () => {
            const file = tmp();
            const store = new TranslationStore(file, cacheFingerprint({}));

            store.load();
            store.flush();

            expect(() => readFileSync(file)).toThrow();

            store.set('Привет', 'Hello');
            store.flush();

            expect(JSON.parse(readFileSync(file, 'utf8')).translations).toBeTruthy();
        });
    });

    describe('SeedStore', () => {
        it('should persist seeded pairs between instances', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');

            const first = new SeedStore(file);
            first.load();
            first.set('Привет', 'Hello');
            first.flush();

            const second = new SeedStore(file);
            second.load();

            expect(second.get('Привет')).toBe('Hello');
            expect(second.get('Другое')).toBeUndefined();
        });

        it('should survive a corrupted seed file', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');
            writeFileSync(file, 'not a json');

            const store = new SeedStore(file);

            expect(() => store.load()).not.toThrow();
            expect(store.get('Привет')).toBeUndefined();
        });

        it('should rebuild the file from scratch on flush', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');

            const first = new SeedStore(file);
            first.load();
            first.set('Привет', 'Hello');
            first.set('Пока', 'Bye');
            first.flush();

            // A later seeding run derives the state anew and must fully
            // replace stale entries, not merge with them.
            const second = new SeedStore(file);
            second.set('Привет', 'Hi');
            second.flush();

            const third = new SeedStore(file);
            third.load();

            expect(third.get('Привет')).toBe('Hi');
            expect(third.get('Пока')).toBeUndefined();
        });
    });

    describe('SeedStore dictionary and memory', () => {
        it('should keep the most common wording of a repeated text', () => {
            const store = new SeedStore(join(tmpDir(), 'seed.ru-en.json'));

            store.set('Привет', 'Hi');
            store.set('Привет', 'Hello');
            store.set('Привет', 'Hello');

            expect(store.get('Привет')).toBe('Hello');
        });

        it('should keep the first wording on a tie', () => {
            const store = new SeedStore(join(tmpDir(), 'seed.ru-en.json'));

            store.set('Привет', 'Hi');
            store.set('Привет', 'Hello');

            expect(store.get('Привет')).toBe('Hi');
        });

        it('should ignore a seed file of a previous version', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');
            writeFileSync(
                file,
                JSON.stringify({
                    version: 2,
                    translations: {abc: 'Hi'},
                    files: {'ru/a.md': [['abc', 'Hi']]},
                }),
            );

            const store = new SeedStore(file);
            store.load();

            expect(store.memory('ru/a.md')).toBeUndefined();
        });

        it('should keep the source text in the per-file memory', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');
            const store = new SeedStore(file);
            store.record('ru/a.md', [['Привет', 'Hi']]);
            store.flush();

            const data = JSON.parse(readFileSync(file, 'utf8'));

            expect(data.version).toBe(3);
            expect(data.files['ru/a.md']).toEqual([['Привет', 'Hi']]);
        });

        it('should persist the per-file sequence of pairs', () => {
            const file = join(tmpDir(), 'seed.ru-en.json');

            const first = new SeedStore(file);
            first.record('ru/a.md', [
                ['Привет', 'Hi'],
                ['Пока', 'Bye'],
                ['Привет', 'Hello'],
            ]);
            first.flush();

            const second = new SeedStore(file);
            second.load();

            expect(second.memory('ru/a.md')?.map(([, translation]) => translation)).toEqual([
                'Hi',
                'Bye',
                'Hello',
            ]);
            expect(second.memory('ru/other.md')).toBeUndefined();
        });
    });

    describe('SeedStore doubtful pairs', () => {
        it('should keep doubtful pairs in the file memory only', () => {
            const store = new SeedStore(join(tmpDir(), 'seed.ru-en.json'));

            store.record('ru/a.md', [
                ['Привет', 'Hi'],
                ['Пока', 'Bye', true],
            ]);

            expect(store.get('Привет')).toBe('Hi');
            expect(store.get('Пока')).toBeUndefined();
            expect(store.memory('ru/a.md')?.map(([, translation]) => translation)).toEqual([
                'Hi',
                'Bye',
            ]);
        });
    });

    describe('TranslationStore.resolve', () => {
        function withMemory(file: string, pairs: [string, string][]) {
            const dir = tmpDir();
            const seeds = new SeedStore(join(dir, 'seed.ru-en.json'));
            seeds.record(file, pairs);
            const store = new TranslationStore(
                join(dir, 'store.json'),
                cacheFingerprint({}),
                seeds,
            );
            return store;
        }

        it('should keep each wording of a repeated sentence in its place', () => {
            const store = withMemory('ru/a.md', [
                ['Привет', 'Hi'],
                ['Пока', 'Bye'],
                ['Привет', 'Hello'],
            ]);

            expect(store.resolve('ru/a.md', ['Привет', 'Пока', 'Привет'])).toEqual([
                'Hi',
                'Bye',
                'Hello',
            ]);
        });

        it('should skip inserted units and serve the rest from the sequence', () => {
            const store = withMemory('ru/a.md', [
                ['Привет', 'Hi'],
                ['Пока', 'Bye'],
                ['Привет', 'Hello'],
            ]);

            expect(store.resolve('ru/a.md', ['Новое', 'Привет', 'Пока', 'Ещё', 'Привет'])).toEqual([
                undefined,
                'Hi',
                'Bye',
                undefined,
                'Hello',
            ]);
        });

        it('should serve a moved unit from the unused entry of the same text', () => {
            const store = withMemory('ru/a.md', [
                ['Один', 'One'],
                ['Два', 'Two'],
                ['Три', 'Three'],
            ]);

            expect(store.resolve('ru/a.md', ['Три', 'Один', 'Два'])).toEqual([
                'Three',
                'One',
                'Two',
            ]);
        });

        it('should fall back to the dictionary for files without a memory', () => {
            const store = withMemory('ru/a.md', [['Привет', 'Hi']]);

            expect(store.resolve('ru/b.md', ['Привет', 'Пока'])).toEqual(['Hi', undefined]);
        });
    });

    describe('TranslationStore.hints', () => {
        function withMemory(file: string, pairs: [string, string][]) {
            const dir = tmpDir();
            const seeds = new SeedStore(join(dir, 'seed.ru-en.json'));
            seeds.record(file, pairs);
            return new TranslationStore(join(dir, 'store.json'), cacheFingerprint({}), seeds);
        }

        it('should trace a changed unit to its previous version', () => {
            const store = withMemory('ru/a.md', [
                ['Привет', 'Hi'],
                ['Чтобы настроить колонкам по статусам:', 'To set up columns by status:'],
                ['Пока', 'Bye'],
            ]);

            expect(
                store.hints('ru/a.md', ['Привет', 'Чтобы настроить колонки по статусам:', 'Пока']),
            ).toEqual([
                undefined,
                {
                    source: 'Чтобы настроить колонкам по статусам:',
                    translation: 'To set up columns by status:',
                },
                undefined,
            ]);
        });

        it('should not offer an entry a unit still uses', () => {
            const store = withMemory('ru/a.md', [['Один два три четыре', 'One two three four']]);

            // The first unit takes the entry verbatim; the second is close
            // to it but the entry is no longer free.
            expect(
                store.hints('ru/a.md', ['Один два три четыре', 'Один два три четыре пять']),
            ).toEqual([undefined, undefined]);
        });

        it('should leave a unit far from every unused entry without a hint', () => {
            const store = withMemory('ru/a.md', [['Один два три', 'One two three']]);

            expect(store.hints('ru/a.md', ['Совсем другое предложение'])).toEqual([undefined]);
        });

        it('should use every previous version once, closest first in document order', () => {
            const store = withMemory('ru/a.md', [
                ['Первое предложение про очередь', 'First sentence about the queue'],
                ['Второе предложение про доску', 'Second sentence about the board'],
            ]);

            expect(
                store.hints('ru/a.md', [
                    'Второе предложение про доску задач',
                    'Первое предложение про очередь задач',
                    'Ещё одно предложение про очередь',
                ]),
            ).toEqual([
                {
                    source: 'Второе предложение про доску',
                    translation: 'Second sentence about the board',
                },
                {
                    source: 'Первое предложение про очередь',
                    translation: 'First sentence about the queue',
                },
                undefined,
            ]);
        });

        it('should return nothing for files without a memory', () => {
            const store = withMemory('ru/a.md', [['Привет', 'Hi']]);

            expect(store.hints('ru/b.md', ['Привет мир'])).toEqual([undefined]);
        });

        it('should serve translations and hints in one lookup', () => {
            const store = withMemory('ru/a.md', [
                ['Привет', 'Hi'],
                ['Один два три четыре', 'One two three four'],
            ]);

            expect(store.lookup('ru/a.md', ['Привет', 'Один два три пять'])).toEqual({
                translations: ['Hi', undefined],
                hints: [
                    undefined,
                    {source: 'Один два три четыре', translation: 'One two three four'},
                ],
            });
        });

        it('should handle a file changed as a whole in reasonable time', () => {
            const sentence = (k: number) =>
                `Предложение номер ${k} описывает поле ${k % 17} очереди и его ограничение ${k % 5}.`;
            const pairs: [string, string][] = Array.from({length: 1500}, (_, k) => [
                sentence(k),
                `Sentence ${k}`,
            ]);
            const store = withMemory('ru/a.md', pairs);
            const texts = pairs.map(([source]) => source.replace('описывает', 'задает'));

            const started = Date.now();
            const {hints} = store.lookup('ru/a.md', texts);

            expect(Date.now() - started).toBeLessThan(2000);
            expect(hints.filter(Boolean).length).toBe(1500);
            expect(hints[7]?.source).toBe(sentence(7));
        });
    });

    describe('TranslationStore with seeds', () => {
        it('should fall back to seeds for units missing in translations', () => {
            const dir = tmpDir();
            const seeds = new SeedStore(join(dir, 'seed.ru-en.json'));
            seeds.set('Привет', 'Hello');
            seeds.flush();
            seeds.load();

            const store = new TranslationStore(
                join(dir, 'store.json'),
                cacheFingerprint({}),
                seeds,
            );
            store.load();

            expect(store.get('Привет')).toBe('Hello');
            expect(store.get('Другое')).toBeUndefined();
        });

        it('should prefer seeds over stored translations', () => {
            // Seeds reflect the current state of target files (including
            // manual edits), so they win over older LLM translations.
            const dir = tmpDir();

            const store = new TranslationStore(join(dir, 'store.json'), cacheFingerprint({}));
            store.load();
            store.set('Привет', 'Hello');
            store.flush();

            const seeds = new SeedStore(join(dir, 'seed.ru-en.json'));
            seeds.set('Привет', 'Hi there');
            seeds.flush();
            seeds.load();

            const second = new TranslationStore(
                join(dir, 'store.json'),
                cacheFingerprint({}),
                seeds,
            );
            second.load();

            expect(second.get('Привет')).toBe('Hi there');
        });

        it('should not write seeds into the translations file', () => {
            const dir = tmpDir();
            const seeds = new SeedStore(join(dir, 'seed.ru-en.json'));
            seeds.set('Привет', 'Hello');
            seeds.flush();
            seeds.load();

            const file = join(dir, 'store.json');
            const store = new TranslationStore(file, cacheFingerprint({}), seeds);
            store.load();
            store.set('Пока', 'Bye');
            store.flush();

            const written = JSON.parse(readFileSync(file, 'utf8'));

            expect(Object.keys(written.translations)).toHaveLength(1);
        });
    });

    describe('seedFilePath', () => {
        it('should build one seed file per language pair', () => {
            expect(seedFilePath('/cache' as AbsolutePath, 'ru', 'en')).toBe(
                join('/cache', 'seed.ru-en.json'),
            );
        });
    });
});
