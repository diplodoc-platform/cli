import {describe, expect, it} from 'vitest';

import {checkGlossary, stemTerm} from './glossary';

const PAIRS = [
    {sourceText: 'заметка', translatedText: 'note'},
    {sourceText: 'оглавление', translatedText: 'table of contents'},
];

describe('translate eval glossary check', () => {
    describe('stemTerm', () => {
        it('should strip a single russian ending', () => {
            expect(stemTerm('заметка')).toBe('заметк');
            expect(stemTerm('оглавление')).toBe('оглавлен');
            expect(stemTerm('переменная')).toBe('переменн');
        });

        it('should keep latin terms as is', () => {
            expect(stemTerm('Diplodoc CLI')).toBe('diplodoc cli');
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
