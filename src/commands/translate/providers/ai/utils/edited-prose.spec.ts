import {describe, expect, it} from 'vitest';

import {
    hasCopiedEdit,
    hasLowercaseSourceProse,
    hasUnexpectedEnglishProse,
    isProseEcho,
} from './edited-prose';
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

describe('lowercase residual source prose', () => {
    const marker = untranslatedMarker('ru', 'zh');

    it.each([
        'Для модели Express коды не проверяются。',
        '卖家 кабинете',
        'размещения 合同',
        '<g ctype="link" equiv-text="[{{text}}](*quantum)">квант</g>',
        '账户（кабинет）',
    ])('rejects an ordinary residual word in otherwise translated prose: %s', (text) => {
        expect(hasLowercaseSourceProse(text, marker)).toBe(true);
    });

    it.each([
        'Yandex Market',
        'Open Яндекс.',
        'Use Честный ЗНАК, МКК, УПД-1 and ЭТрН.',
        '<g ctype="code">русское имя</g>',
        '<x ctype="code_open" equiv-text="`"/>русское имя<x ctype="code_close" equiv-text="`"/>',
        '<x ctype="no_translate_inline" equiv-text=":no-translate[русское имя]"/>',
        'https://example.com/русское-имя',
        '`русское имя`',
    ])('preserves names, acronyms and protected literal data: %s', (text) => {
        expect(hasLowercaseSourceProse(text, marker)).toBe(false);
    });

    it.each([
        '<code class="literal">русское имя</code>',
        '<source data-yfm-context="code">{"name":"русское имя"}</source>',
    ])('does not infer protection from added target wrapper metadata: %s', (text) => {
        // Actual protected literals arrive as source-owned code nodes/placeholders.
        expect(hasLowercaseSourceProse(text, marker)).toBe(true);
    });

    it('preserves only exact explicit glossary spellings at source-script boundaries', () => {
        expect(hasLowercaseSourceProse('中文название', marker, ['название'])).toBe(false);
        expect(hasLowercaseSourceProse('中文названия', marker, ['название'])).toBe(true);
        expect(hasLowercaseSourceProse('названиеимя', marker, ['название'])).toBe(true);
        expect(hasLowercaseSourceProse('имя+код', marker, ['имя+код'])).toBe(false);
    });

    it.each(['а', '变量 а', '变量а', '变量а́'])(
        'preserves a single source-script letter next to other scripts: %s',
        (text) => expect(hasLowercaseSourceProse(text, marker)).toBe(false),
    );

    it('still rejects a complete residual source word next to CJK', () => {
        expect(hasLowercaseSourceProse('中文кабинет', marker)).toBe(true);
    });

    it.each([
        ['название', 'название системы'],
        ['название системы', 'название'],
        ['название системы', 'системы поставки'],
        ['системы поставки', 'название системы'],
    ])('protects overlapping original glossary spans regardless of order: %j', (...allowed) => {
        const text = allowed.includes('системы поставки')
            ? 'Use название системы поставки.'
            : 'Use название системы.';
        expect(hasLowercaseSourceProse(text, marker, allowed)).toBe(false);
    });

    it('does not discriminate shared scripts or a Latin source', () => {
        expect(hasLowercaseSourceProse('исходный текст', untranslatedMarker('ru', 'uk'))).toBe(
            false,
        );
        expect(hasLowercaseSourceProse('source text', untranslatedMarker('en', 'zh'))).toBe(false);
    });
});

describe('English prose without target Han', () => {
    const marker = untranslatedMarker('ru', 'zh');
    it.each([
        'Possible values.',
        'The courier gives the code to the seller to receive the order.',
        '<code>Possible values.</code>',
        '<source data-yfm-context="code">Possible values.</source>',
        'Possible values. <g ctype="code">中文</g>',
        'Possible values. https://example.com/中文',
        '<g data-label="中文">Possible values.</g>',
    ])('finds an ordinary wrong-language phrase: %s', (target) => {
        expect(hasUnexpectedEnglishProse('Возможные значения.', target, marker)).toBe(true);
    });
    it.each([
        '可能的值。',
        'Yandex Market',
        'Chestny ZNAK',
        'МКК, ЭАПП, УПД-1',
        '<g ctype="code">Possible values.</g>',
        'support@example.com',
        'support.example.com',
        '/v1/orders/{some}/{id}',
        'Yandex Market support@example.com',
    ])('preserves translated prose and technical names/literals: %s', (target) => {
        expect(hasUnexpectedEnglishProse('Возможные значения.', target, marker)).toBe(false);
    });
    it('keeps a domain from hiding an actual English sentence', () => {
        expect(
            hasUnexpectedEnglishProse(
                'Контактный адрес support.example.com.',
                'Wrong sentence support.example.com.',
                marker,
            ),
        ).toBe(true);
    });
    it('checks uppercase source headings but skips single-word names and shared scripts', () => {
        expect(hasUnexpectedEnglishProse('ВОЗМОЖНЫЕ ЗНАЧЕНИЯ', 'Possible values', marker)).toBe(
            true,
        );
        expect(hasUnexpectedEnglishProse('Значения', 'Possible values', marker)).toBe(false);
        expect(hasUnexpectedEnglishProse('Возможные значения', 'Possible values', null)).toBe(
            false,
        );
    });
    it('exempts an exact target term only when its source term occurs in prose', () => {
        const pair = {sourceText: 'Название системы', translatedText: 'some lower name'};
        expect(
            hasUnexpectedEnglishProse('Название системы.', 'some lower name', marker, [pair]),
        ).toBe(false);
        expect(
            hasUnexpectedEnglishProse('Возможные значения.', 'Possible values.', marker, [
                {sourceText: 'другое значение', translatedText: 'values'},
            ]),
        ).toBe(true);
        expect(
            hasUnexpectedEnglishProse('Возможные значения.', 'Possible values.', marker, [
                {sourceText: 'значение', translatedText: 'values'},
            ]),
        ).toBe(true);
        expect(
            hasUnexpectedEnglishProse('Название имя+код.', 'some lower name', marker, [
                {sourceText: 'имя+код', translatedText: 'some lower name'},
            ]),
        ).toBe(false);
    });
    it('keeps one accented source word from becoming two ordinary words', () => {
        expect(hasUnexpectedEnglishProse('Назва́ние', 'Possible values', marker)).toBe(false);
    });
    it('does not match a glossary source prefix inside another word', () => {
        expect(
            hasUnexpectedEnglishProse('Возможные значения.', 'Possible values.', marker, [
                {sourceText: 'значен', translatedText: 'values'},
            ]),
        ).toBe(true);
    });

    it('does not let a source term hidden in code exempt English prose', () => {
        const source = 'Возможные значения: <g ctype="code">другой термин</g>.';
        expect(
            hasUnexpectedEnglishProse(source, 'Possible values.', marker, [
                {sourceText: 'другой термин', translatedText: 'values'},
            ]),
        ).toBe(true);
    });
});
