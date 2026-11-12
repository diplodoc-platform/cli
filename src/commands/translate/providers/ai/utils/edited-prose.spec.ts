import {describe, expect, it} from 'vitest';

import {hasCopiedEdit, isProseEcho} from './edited-prose';
import {untranslatedMarker} from './script';

describe('source prose identity', () => {
    it.each(['en', 'zh'])(
        'recognizes punctuation, spacing and case-only echoes for ru-%s',
        (target) => {
            expect(
                isProseEcho(
                    'Исходный текст.',
                    'ИСХОДНЫЙ  текст。',
                    untranslatedMarker('ru', target),
                ),
            ).toBe(true);
        },
    );
    it('ignores XML wrappers and protected literal code when comparing prose', () => {
        const code = '<x ctype="code_literal" id="code-1"/>';
        expect(
            isProseEcho(
                `<source>Значение всегда ${code}.</source>`,
                `Значение всегда ${code}。`,
                untranslatedMarker('ru', 'zh'),
            ),
        ).toBe(true);
    });
    it.each([
        '<g ctype="code">русское имя</g>',
        '<x ctype="code_open" equiv-text="`"/>русское имя<x ctype="code_close" equiv-text="`"/>',
        '<x ctype="no_translate_inline" equiv-text=":no-translate[Название]" id="x-1"/>',
        'https://example.com/русский-адрес',
        '`русское имя`',
    ])('does not reject protected data without source prose: %s', (text) => {
        expect(isProseEcho(text + '.', text + '。', untranslatedMarker('ru', 'zh'))).toBe(false);
    });
    it('preserves source-script names in otherwise translated prose', () => {
        expect(
            isProseEcho('Откройте Яндекс.', 'Open Яндекс.', untranslatedMarker('ru', 'en')),
        ).toBe(false);
    });
    it.each([
        ['en', 'fr'],
        ['ru', 'uk'],
    ])('does not discriminate shared scripts for %s-%s', (source, target) => {
        expect(isProseEcho('Текст.', 'ТЕКСТ!', untranslatedMarker(source, target))).toBe(false);
    });
});

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
