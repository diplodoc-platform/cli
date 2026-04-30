import {describe, expect, it} from 'vitest';

import {collectFeatures, hashConfig, stableStringify, toLangCode} from './index';

describe('Build stats feature', () => {
    describe('collectFeatures', () => {
        it('returns enabled boolean flags sorted alphabetically', () => {
            const features = collectFeatures({
                singlePage: true,
                staticContent: true,
                addMapFile: true,
            });

            expect(features).toEqual(['addMapFile', 'singlePage', 'staticContent']);
        });

        it('skips flags that are not strictly `true`', () => {
            const features = collectFeatures({
                singlePage: true,
                staticContent: false,
                addMapFile: 1, // truthy but not `true`
                allowHtml: 'yes', // string
                neuroExpert: undefined,
                contributors: null,
                lint: {enabled: true}, // nested object — top-level only
            });

            expect(features).toEqual(['singlePage']);
        });

        it('returns empty array when nothing is enabled', () => {
            expect(collectFeatures({})).toEqual([]);
            expect(
                collectFeatures({
                    addMapFile: false,
                    singlePage: false,
                }),
            ).toEqual([]);
        });
    });

    describe('stableStringify', () => {
        it('produces the same output regardless of key insertion order', () => {
            const a = stableStringify({b: 1, a: 2, c: 3});
            const b = stableStringify({c: 3, a: 2, b: 1});

            expect(a).toBe(b);
            expect(a).toBe('{"a":2,"b":1,"c":3}');
        });

        it('sorts keys recursively in nested objects', () => {
            const out = stableStringify({outer: {z: 1, a: 2}});

            expect(out).toBe('{"outer":{"a":2,"z":1}}');
        });

        it('preserves array order', () => {
            expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
        });

        it('handles primitives and null', () => {
            expect(stableStringify(null)).toBe('null');
            expect(stableStringify('x')).toBe('"x"');
            expect(stableStringify(42)).toBe('42');
            expect(stableStringify(true)).toBe('true');
        });

        it('serializes undefined as null', () => {
            expect(stableStringify(undefined)).toBe('null');
        });
    });

    describe('hashConfig', () => {
        it('returns a stable 16-char hex digest for equal configs', () => {
            const hashA = hashConfig({a: 1, b: 2});
            const hashB = hashConfig({b: 2, a: 1});

            expect(hashA).toBe(hashB);
            expect(hashA).toMatch(/^[0-9a-f]{16}$/);
        });

        it('produces different digests for different configs', () => {
            expect(hashConfig({a: 1})).not.toBe(hashConfig({a: 2}));
        });
    });

    describe('toLangCode', () => {
        it('returns the string as-is when given a string', () => {
            expect(toLangCode('en')).toBe('en');
        });

        it('extracts the lang field from an extended-lang object', () => {
            expect(toLangCode({lang: 'ru', tld: 'ru'} as {lang: string})).toBe('ru');
        });
    });
});
