import {describe, expect, it} from 'vitest';

import {collectSeedPairs} from './seed';

const CYRILLIC = /\p{Script=Cyrillic}/u;

const unit = (text: string) => `<source xml:space="preserve">${text}</source>`;

describe('translate seed pairs', () => {
    describe('collectSeedPairs', () => {
        it('should pair units positionally when counts match', () => {
            const result = collectSeedPairs(
                [unit('Привет.'), unit('Пока.')],
                [unit('Hello.'), unit('Bye.')],
                CYRILLIC,
            );

            expect(result.status).toBe('aligned');
            if (result.status === 'aligned') {
                expect(result.pairs).toEqual([
                    [unit('Привет.'), unit('Hello.')],
                    [unit('Пока.'), unit('Bye.')],
                ]);
                expect(result.skipped).toBe(0);
            }
        });

        it('should report a mismatch when unit counts differ', () => {
            const result = collectSeedPairs(
                [unit('Привет.'), unit('Пока.')],
                [unit('Hello.')],
                CYRILLIC,
            );

            expect(result).toEqual({status: 'mismatch', sourceCount: 2, targetCount: 1});
        });

        it('should skip identity pairs that still look untranslated', () => {
            // The target file kept the source text as is - seeding it would
            // freeze the untranslated leftover forever. Skipping lets the
            // next translate run send it to the LLM.
            const result = collectSeedPairs(
                [unit('Привет.'), unit('yfm build')],
                [unit('Привет.'), unit('yfm build')],
                CYRILLIC,
            );

            expect(result.status).toBe('aligned');
            if (result.status === 'aligned') {
                // Latin-only identity is a legitimately untranslatable unit.
                expect(result.pairs).toEqual([[unit('yfm build'), unit('yfm build')]]);
                expect(result.skipped).toBe(1);
            }
        });

        it('should seed identity pairs when no marker is available', () => {
            const result = collectSeedPairs([unit('Привет.')], [unit('Привет.')], null);

            expect(result.status).toBe('aligned');
            if (result.status === 'aligned') {
                expect(result.pairs).toEqual([[unit('Привет.'), unit('Привет.')]]);
                expect(result.skipped).toBe(0);
            }
        });
    });
});
