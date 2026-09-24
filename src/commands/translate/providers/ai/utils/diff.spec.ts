import {describe, expect, it} from 'vitest';

import {similarity, wordChanges, words} from './diff';

describe('translate ai diff', () => {
    describe('words', () => {
        it('should split on whitespace and drop the xliff wrapper', () => {
            expect(words('<source xml:space="preserve">Привет,  мир\n!</source>')).toEqual([
                'Привет,',
                'мир',
                '!',
            ]);
        });

        it('should keep a tag as one token', () => {
            const tag = '<x ctype="liquid_Variable" equiv-text="{{ tracker-name }}" id="x-1"/>';

            expect(words(`Значения в ${tag}`)).toEqual(['Значения', 'в', tag]);
            expect(words(`в${tag}.`)).toEqual(['в', tag, '.']);
            expect(words('<g id="g-1">жирный</g> текст')).toEqual([
                '<g id="g-1">',
                'жирный',
                '</g>',
                'текст',
            ]);
        });
    });

    describe('similarity', () => {
        it('should be 1 for equal texts and 0 for disjoint ones', () => {
            expect(similarity('Один два три', 'Один два три')).toBe(1);
            expect(similarity('Один два три', 'Четыре пять')).toBe(0);
        });

        it('should ignore word order and count repeated words once each', () => {
            expect(similarity('a b c', 'c b a')).toBe(1);
            expect(similarity('a a a', 'a')).toBeCloseTo(0.5);
        });

        it('should rate a replaced placeholder as close', () => {
            const tag = '<x ctype="liquid_Variable" equiv-text="{{ tracker-name }}" id="x-1"/>';

            expect(
                similarity(
                    `Ограничения и допустимые значения в ${tag}`,
                    'Ограничения и допустимые значения в Трекере',
                ),
            ).toBeCloseTo(0.83, 2);
        });

        it('should rate a one-word edit of a sentence as close', () => {
            expect(
                similarity(
                    'Чтобы настроить колонкам по статусам:',
                    'Чтобы настроить колонки по статусам:',
                ),
            ).toBeCloseTo(0.8);
        });

        it('should treat empty texts as equal to each other only', () => {
            expect(similarity('', '')).toBe(1);
            expect(similarity('', 'a')).toBe(0);
        });
    });

    describe('wordChanges', () => {
        it('should return no changes for equal texts', () => {
            expect(wordChanges('Один два', 'Один два')).toEqual([]);
        });

        it('should describe a replaced word', () => {
            expect(
                wordChanges(
                    'Чтобы настроить колонкам по статусам:',
                    'Чтобы настроить колонки по статусам:',
                ),
            ).toEqual(['replaced "колонкам" with "колонки"']);
        });

        it('should describe removed and inserted runs', () => {
            expect(wordChanges('Заголовок {#anchor}', 'Заголовок')).toEqual([
                'removed "{#anchor}"',
            ]);
            expect(wordChanges('Первое.', 'Первое. Второе предложение.')).toEqual([
                'inserted "Второе предложение."',
            ]);
        });

        it('should report several runs in order', () => {
            expect(wordChanges('a b c d e', 'a x c e f')).toEqual([
                'replaced "b" with "x"',
                'removed "d"',
                'inserted "f"',
            ]);
        });

        it('should cut a long run', () => {
            const before = 'start end';
            const after = 'start ' + Array.from({length: 15}, (_, k) => `w${k}`).join(' ') + ' end';

            expect(wordChanges(before, after)).toEqual([
                'inserted "w0 w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 ..."',
            ]);
        });

        it('should compare the unit text without its xliff wrapper', () => {
            expect(
                wordChanges(
                    '<source xml:space="preserve">Один два</source>',
                    '<source xml:space="preserve">Один три</source>',
                ),
            ).toEqual(['replaced "два" with "три"']);
        });
    });
});
