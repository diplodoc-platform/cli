import {describe, expect, it} from 'vitest';

import {hasCopiedEdit} from './edited-prose';
import {untranslatedMarker} from './script';

describe('untranslated source edits', () => {
    const marker = untranslatedMarker('ru', 'en');
    const hint = {source: 'Создайте форму.', translation: 'Create a form.'};

    it('finds an inserted source phrase in otherwise translated prose', () => {
        expect(
            hasCopiedEdit(
                'Важное уточнение: Создайте форму.',
                'Важное уточнение: Create a form.',
                hint,
                marker,
            ),
        ).toBe(true);
    });

    it('accepts a translated insertion', () => {
        expect(
            hasCopiedEdit(
                'Важное уточнение: Создайте форму.',
                'Important clarification: Create a form.',
                hint,
                marker,
            ),
        ).toBe(false);
    });

    it.each([
        '`новое имя`',
        '<g ctype="code" x-begin="`" x-end="`">новое имя</g>',
        '<x ctype="code_open" equiv-text="`"/>новое имя<x ctype="code_close" equiv-text="`"/>',
        'https://example.com/новое-имя',
    ])('preserves literal code and addresses: %s', (literal) => {
        expect(
            hasCopiedEdit('Создайте форму ' + literal, 'Create a form ' + literal, hint, marker),
        ).toBe(false);
    });

    it('accepts source-script wording already used in the existing translation', () => {
        const previous = {source: 'Откройте Яндекс.', translation: 'Open Яндекс.'};
        expect(
            hasCopiedEdit('Яндекс: Откройте Яндекс.', 'Яндекс: Open Яндекс.', previous, marker),
        ).toBe(false);
    });

    it('accepts an explicitly required source-script glossary spelling', () => {
        expect(
            hasCopiedEdit(
                'Создайте форму Безопасность.',
                'Create a Безопасность form.',
                hint,
                marker,
                ['Безопасность'],
            ),
        ).toBe(false);
    });

    it('does not claim to detect untranslated edits in shared scripts', () => {
        expect(
            hasCopiedEdit(
                'Create a new form.',
                'Create a new form.',
                {source: 'Create a form.', translation: 'Créer un formulaire.'},
                untranslatedMarker('en', 'fr'),
            ),
        ).toBe(false);
    });
});
