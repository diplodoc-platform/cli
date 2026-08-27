import {describe, expect, it} from 'vitest';

import {findUntranslatedLines, sourceScriptMarker} from './segments';

describe('translate eval untranslated segments', () => {
    describe('sourceScriptMarker', () => {
        it('should discriminate cyrillic sources', () => {
            const marker = sourceScriptMarker('ru', 'en');

            expect(marker).not.toBeNull();
            expect(marker?.test('Привет')).toBe(true);
            expect(marker?.test('Hello')).toBe(false);
        });

        it('should not discriminate latin sources', () => {
            expect(sourceScriptMarker('en', 'ru')).toBeNull();
        });

        it('should not discriminate a shared script', () => {
            expect(sourceScriptMarker('ru', 'ru')).toBeNull();
        });
    });

    describe('findUntranslatedLines', () => {
        const marker = sourceScriptMarker('ru', 'en');

        it('should report source-script lines missing from the reference', () => {
            const translated = ['# Title', '', 'Это не перевели.', 'This one is fine.'].join('\n');
            const reference = ['# Title', '', 'This was translated.', 'This one is fine.'].join(
                '\n',
            );

            expect(findUntranslatedLines(translated, reference, marker)).toEqual([
                {line: 3, text: 'Это не перевели.'},
            ]);
        });

        it('should allow source-script lines that the reference also keeps', () => {
            const translated = 'The word «привет» is russian.';
            const reference = 'The word «привет» is russian.';

            expect(findUntranslatedLines(translated, reference, marker)).toEqual([]);
        });

        it('should ignore code fences', () => {
            const translated = ['```', 'echo "не переводить"', '```'].join('\n');

            expect(findUntranslatedLines(translated, 'anything', marker)).toEqual([]);
        });

        it('should return nothing without a marker', () => {
            expect(findUntranslatedLines('Привет', 'x', null)).toEqual([]);
        });
    });
});
