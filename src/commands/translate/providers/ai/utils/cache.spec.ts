import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TranslationStore, cacheFingerprint} from './cache';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'yfm-translate-cache-')), 'store.json');

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
});
