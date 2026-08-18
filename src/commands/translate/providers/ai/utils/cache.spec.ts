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
