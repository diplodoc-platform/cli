import {describe, expect, it} from 'vitest';

import {checkGlossary, termStem} from './glossary';

const PAIRS = [
    {sourceText: 'заметка', translatedText: 'note', sourceStem: 'заметк'},
    {sourceText: 'оглавление', translatedText: 'table of contents', sourceStem: 'оглавлени'},
];

describe('translate eval glossary check', () => {
    describe('termStem', () => {
        it('should prefer the explicit stem', () => {
            expect(termStem(PAIRS[0])).toBe('заметк');
        });

        it('should fall back to the term itself', () => {
            expect(termStem({sourceText: 'Diplodoc CLI', translatedText: 'Diplodoc CLI'})).toBe(
                'diplodoc cli',
            );
        });
    });

    it('should pass when the required translation is present', () => {
        const violations = checkGlossary(
            'Это заметка. Заметки бывают разными.',
            'This is a note. Notes differ.',
            PAIRS,
        );

        expect(violations).toEqual([]);
    });

    it('should report a term translated differently', () => {
        const violations = checkGlossary('Это заметка.', 'This is a remark.', PAIRS);

        expect(violations).toEqual([
            {sourceText: 'заметка', translatedText: 'note', sourceOccurrences: 1},
        ]);
    });

    it('should ignore terms that the source page does not use', () => {
        expect(checkGlossary('Просто текст.', 'Just text.', PAIRS)).toEqual([]);
    });

    it('should not count term occurrences inside code fences', () => {
        const source = ['```', 'заметка', '```'].join('\n');

        expect(checkGlossary(source, 'anything', PAIRS)).toEqual([]);
    });

    it('should not accept a term hidden inside a link destination', () => {
        // A required translation must appear in the visible text: the
        // `link` substring inside `./links.md` does not count.
        const violations = checkGlossary(
            'Это ссылка на документ.',
            'See the [documentation](./links.md).',
            [{sourceText: 'ссылка', translatedText: 'link', sourceStem: 'ссылк'}],
        );

        expect(violations).toEqual([
            {sourceText: 'ссылка', translatedText: 'link', sourceOccurrences: 1},
        ]);
    });

    it('should accept a term used as link text', () => {
        const violations = checkGlossary(
            'Это ссылка на документ.',
            'This is a [link](./doc.md) to the document.',
            [{sourceText: 'ссылка', translatedText: 'link', sourceStem: 'ссылк'}],
        );

        expect(violations).toEqual([]);
    });

    it('should match inflected forms through the stem', () => {
        const violations = checkGlossary('Об оглавлении страницы.', 'About the page menu.', PAIRS);

        expect(violations).toEqual([
            {
                sourceText: 'оглавление',
                translatedText: 'table of contents',
                sourceOccurrences: 1,
            },
        ]);
    });
});
