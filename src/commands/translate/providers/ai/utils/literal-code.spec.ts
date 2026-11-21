import {describe, expect, it} from 'vitest';
import {extract} from '@diplodoc/translation';

import {
    keepsLiteralCodeIdentities,
    literalCodeIdentities,
    maskLiteralCode,
    unmaskLiteralCode,
} from './literal-code';
import {renumberMemory} from './placeholders';
import {markupStructureIssue} from './markup-structure';

describe('literal code protection', () => {
    const code =
        '<x ctype="code_open" equiv-text="`" id="x-1"/>код-цвета<x ctype="code_close" equiv-text="`" id="x-2"/>';

    it('hides literal contents and restores them without touching translated prose', () => {
        const source = `Добавьте ${code} в ячейку.`;
        const masked = maskLiteralCode(source);
        expect(masked).not.toContain('код-цвета');
        expect(
            unmaskLiteralCode(
                source,
                masked.replace('Добавьте', 'Add').replace('в ячейку.', 'to the cell.'),
            ),
        ).toBe(`Add ${code} to the cell.`);
    });

    it('does not guess the content of code crossing unit boundaries', () => {
        const partial = '<x ctype="code_close" equiv-text="`" id="x-2"/> код-цвета';
        expect(maskLiteralCode(partial)).toBe(partial);
    });

    it('keeps separate literals distinct, including grouped code', () => {
        const source = `${code} <g ctype="code" id="g-1">другой-код</g>`;
        const masked = maskLiteralCode(source);
        expect(masked).not.toContain('другой-код');
        expect(unmaskLiteralCode(source, masked)).toBe(source);
    });

    it('leaves missing and duplicate markers visible to the structural guard', () => {
        const masked = maskLiteralCode(code);
        expect(unmaskLiteralCode(code, '')).toBe('');
        expect(markupStructureIssue(code, unmaskLiteralCode(code, masked + masked))).toBeDefined();
        expect(unmaskLiteralCode(code, '<x ctype="code_literal" id="literal-9"/>')).toContain(
            'literal-9',
        );
    });

    it('rejects replacing a second literal with a duplicate of the first', () => {
        const other = code.replace('код-цвета', 'другое');
        const source = `Use ${code} instead of ${other}`;
        const result = unmaskLiteralCode(
            source,
            `Use ${maskLiteralCode(code)} instead of ${maskLiteralCode(code)}`,
        );
        expect(markupStructureIssue(source, result)).toBeDefined();
    });

    it('preserves literal identity when the approved translation reverses word order', () => {
        const span = (text: string, id: number) => `<g ctype="code" id="g-${id}">${text}</g>`;
        const source = `Используйте ${span('A', 1)} вместо ${span('B', 2)}.`;
        const target = `Replace ${span('B', 1)} with ${span('A', 2)}.`;
        const current = `Теперь ${source}`;
        const hint = renumberMemory(current, {source, translation: target});
        expect(unmaskLiteralCode(current, maskLiteralCode(hint.translation))).toBe(
            `Replace ${span('B', 2)} with ${span('A', 1)}.`,
        );
    });
});

describe('source-owned literal identities', () => {
    const value = 'COURIER_TO_MERCHANT';
    const span = (text = value, index = 1, tick = '\x60') =>
        '<x ctype="code_open" equiv-text="' +
        tick +
        '" id="x-' +
        index +
        '"/>' +
        text +
        '<x ctype="code_close" equiv-text="' +
        tick +
        '" id="x-' +
        (index + 1) +
        '"/>';
    const code = span();
    const source = code + ' — курьер передает код продавцу для получения заказа.';
    const masked = '<x ctype="code_literal" id="literal-eb129a3d34307c7a"/>';

    it('binds the real complete EAC span to its existing opaque identity', () => {
        expect([...literalCodeIdentities(source)]).toEqual([['literal-eb129a3d34307c7a', value]]);
        expect(maskLiteralCode(source)).toBe(
            masked + ' — курьер передает код продавцу для получения заказа.',
        );
    });

    it('keeps aliases source-owned without changing source or mask keys', () => {
        const other = span('MERCHANT_TO_COURIER', 5);
        const input = code + span(value, 3, '\x60\x60') + other;
        expect([...literalCodeIdentities(input).values()]).toEqual([
            value,
            value,
            'MERCHANT_TO_COURIER',
        ]);
        expect([...literalCodeIdentities(code + span(value, 3)).values()]).toEqual([value]);
        expect(unmaskLiteralCode(input, maskLiteralCode(input))).toBe(input);
    });

    it.each(['code', 'code_inline'])('reads an unambiguous typed %s group', (type) => {
        expect([
            ...literalCodeIdentities('<g ctype="' + type + '" id="g-1">' + value + '</g>').values(),
        ]).toEqual([value]);
    });

    it.each([
        'limit',
        'COURIER',
        'COURIER TO MERCHANT',
        'COURIER_to_MERCHANT',
        'COURIER&#95;TO_MERCHANT',
        'https://COURIER_TO_MERCHANT.test',
        ' COURIER_TO_MERCHANT',
        'COURIER_TO_MERCHANT\n',
    ])('does not promote noncanonical literal content: %s', (text) => {
        expect(literalCodeIdentities(span(text)).size).toBe(0);
    });

    it.each([
        '<x ctype="code_open" equiv-text="\x60" id="x-1"/>COURIER_TO_MERCHANT',
        'COURIER_TO_MERCHANT<x ctype="code_close" equiv-text="\x60" id="x-2"/>',
        '<x ctype="code_open" equiv-text="\x60" id="x-1"/>COURIER_TO_MERCHANT<x ctype="code_close" equiv-text="\x60\x60" id="x-2"/>',
        '<x ctype="code_open" equiv-text="\x60" id="x-1"/>COURIER_TO_MERCHANT<x ctype="code_close" equiv-text="\x60" id="x-1"/>',
        '<x ctype="code_open" equiv-text="\x60" id="x-1" data-extra="1"/>COURIER_TO_MERCHANT<x ctype="code_close" equiv-text="\x60" id="x-2"/>',
        '<x note="ctype=\x27code_open\x27" equiv-text="\x60" id="x-1"/>COURIER_TO_MERCHANT<x ctype="code_close" equiv-text="\x60" id="x-2"/>',
        '<g ctype="link" id="g-1" x-end="&lt;x ctype=&quot;code_open&quot;/&gt;COURIER_TO_MERCHANT">label</g>',
        '<g ctype="code" id="g-1"><g ctype="code" id="g-2">COURIER_TO_MERCHANT</g></g>',
        '<g ctype="code" id="g-1" x-begin="\x60" x-end="\x60\x60" equiv-text="\x60{{text}}\x60\x60">COURIER_TO_MERCHANT</g>',
        '<g ctype="code" id="g-1">COURIER_TO_MERCHANT',
    ])('does not infer identities from malformed, partial or nested spans: %s', (input) => {
        expect(literalCodeIdentities(input).size).toBe(0);
    });

    it('does not take a tag-looking substring inside an attribute for a code span', () => {
        expect(
            literalCodeIdentities('<g ctype="link" x-end=\x27' + code + '\x27 id="g-1">label</g>')
                .size,
        ).toBe(0);
    });

    it('rejects reused generated source IDs outside the candidate span', () => {
        expect(literalCodeIdentities(code + '<x ctype="lb" id="x-1"/>').size).toBe(0);
    });

    it('allows masked or complete code to reorder without rewriting it', () => {
        const other = span('MERCHANT_TO_COURIER', 3);
        const input = code + ' instead of ' + other;
        expect(
            keepsLiteralCodeIdentities(input, maskLiteralCode(other) + ' rather than ' + masked),
        ).toBe(true);
        expect(keepsLiteralCodeIdentities(input, other + ' rather than ' + code)).toBe(true);
        expect(keepsLiteralCodeIdentities(source, source)).toBe(true);
    });

    it.each([
        'COURIER_TO_MERCHANT',
        'COURIER&#95;TO&#95;MERCHANT',
        '&#67;OURIER_TO_MERCHANT',
        'COURIER&amp;#95;TO_MERCHANT',
        '&lt;g title=&quot;COURIER_TO_MERCHANT&quot;&gt;',
        'https://test.invalid/COURIER_TO_MERCHANT',
        '前COURIER_TO_MERCHANT后',
    ])('rejects a hinted identifier copied into ordinary output: %s', (copy) => {
        expect(keepsLiteralCodeIdentities(source, masked + ' ' + copy)).toBe(false);
    });

    it('bounds ordinary copies by their own source occurrence count', () => {
        const input = source + ' COURIER_TO_MERCHANT';
        expect(keepsLiteralCodeIdentities(input, masked + ' COURIER_TO_MERCHANT')).toBe(true);
        expect(keepsLiteralCodeIdentities(input, masked)).toBe(true);
        expect(
            keepsLiteralCodeIdentities(input, masked + ' COURIER_TO_MERCHANT COURIER_TO_MERCHANT'),
        ).toBe(false);
        expect(
            keepsLiteralCodeIdentities(
                source + ' COURIER&#95;TO_MERCHANT',
                masked + ' COURIER_TO_MERCHANT',
            ),
        ).toBe(true);
    });

    it('ignores real structural attributes but counts escaped or malformed tag copies', () => {
        const link =
            '<g ctype="link" id="g-1" x-end="](https://test.invalid/COURIER_TO_MERCHANT)">label</g>';
        expect(keepsLiteralCodeIdentities(source, masked + link)).toBe(true);
        expect(keepsLiteralCodeIdentities(source, masked + '<g title="COURIER_TO_MERCHANT>')).toBe(
            false,
        );
        expect(keepsLiteralCodeIdentities(source + link, source + link)).toBe(true);
    });

    it('matches full ASCII identifiers at prose and URL boundaries', () => {
        expect(
            keepsLiteralCodeIdentities(
                source,
                masked + ' OTHER_COURIER_TO_MERCHANT COURIER_TO_MERCHANT2',
            ),
        ).toBe(true);
        const url = ' https://test.invalid/COURIER_TO_MERCHANT';
        expect(keepsLiteralCodeIdentities(source + url, source + url)).toBe(true);
        expect(
            keepsLiteralCodeIdentities(source + url, masked + url + ' COURIER_TO_MERCHANT'),
        ).toBe(false);
    });

    it('checks every batch answer against explicit identities, even without local code', () => {
        const identities = new Map([['literal-eb129a3d34307c7a', value]]);
        expect(
            keepsLiteralCodeIdentities(
                'Курьер получает заказ.',
                'The courier receives COURIER_TO_MERCHANT.',
                identities,
            ),
        ).toBe(false);
        expect(
            keepsLiteralCodeIdentities(
                'COURIER_TO_MERCHANT означает код.',
                'COURIER_TO_MERCHANT means code.',
                identities,
            ),
        ).toBe(true);
        expect(
            keepsLiteralCodeIdentities(
                'COURIER_TO_MERCHANT означает код.',
                'COURIER_TO_MERCHANT COURIER_TO_MERCHANT',
                identities,
            ),
        ).toBe(false);
    });

    it.each([
        '<x ctype="lb" equiv-text="&amp;#10;" id="x-3"/>',
        '<x ctype="code_literal" id="literal-1111111111111111"/>',
        span('OTHER_CODE', 3),
    ])('separates visible identifier boundaries at structural or code nodes: %s', (boundary) => {
        expect(
            keepsLiteralCodeIdentities(source, masked + ' ' + value + boundary + 'Continue.'),
        ).toBe(false);
        const mention = source + ' ' + value + boundary + 'Continue.';
        expect(keepsLiteralCodeIdentities(mention, mention)).toBe(true);
        expect(
            keepsLiteralCodeIdentities(mention, masked + ' ' + value + boundary + 'Continue.'),
        ).toBe(true);
    });

    it('joins formatting-only nodes when checking a copied identifier', () => {
        const bold = 'COURIER_<g ctype="bold" id="g-1">TO</g>_MERCHANT';
        const paired =
            'COURIER_<x ctype="bold_open" equiv-text="**" id="x-3"/>TO<x ctype="bold_close" equiv-text="**" id="x-4"/>_MERCHANT';
        expect(keepsLiteralCodeIdentities(source, masked + ' ' + bold)).toBe(false);
        expect(keepsLiteralCodeIdentities(source, masked + ' ' + paired)).toBe(false);
    });

    it('does not count a complete protected code as ordinary allowance after a partial close', () => {
        const partial = '<x ctype="code_close" equiv-text="\x60" id="x-9"/>';
        const input = partial + ' передайте ' + code + ' курьеру.';
        const identities = new Map([['literal-eb129a3d34307c7a', value]]);
        const translated = partial + ' hand ' + masked + ' to the courier.';
        expect(literalCodeIdentities(input).size).toBe(0);
        expect(
            keepsLiteralCodeIdentities(input, translated + ' COURIER_TO_MERCHANT', identities),
        ).toBe(false);
        expect(keepsLiteralCodeIdentities(input, input, identities)).toBe(true);
        expect(
            keepsLiteralCodeIdentities(
                input + ' COURIER_TO_MERCHANT',
                translated + ' COURIER_TO_MERCHANT',
                identities,
            ),
        ).toBe(true);
    });

    it('does not grant ordinary allowance from source address attributes after a partial close', () => {
        const partial = '<x ctype="code_close" equiv-text="\x60" id="x-9"/>';
        const address =
            '<g ctype="link" id="g-1" x-end="](https://test.invalid/COURIER_TO_MERCHANT)">ссылка</g>';
        const input = partial + code + address;
        const identities = new Map([['literal-eb129a3d34307c7a', value]]);
        expect(
            keepsLiteralCodeIdentities(
                input,
                partial + masked + ' COURIER_TO_MERCHANT',
                identities,
            ),
        ).toBe(false);
        expect(keepsLiteralCodeIdentities(input, input, identities)).toBe(true);
    });

    it('keeps the actual extracted line-break boundary in visible prose counting', () => {
        const extracted = extract('COURIER_TO_MERCHANT\nContinue.', {
            compact: true,
            unitLocalIds: true,
            source: {language: 'ru', locale: 'RU'},
            target: {language: 'en', locale: 'US'},
        });
        expect(extracted.units).toHaveLength(1);
        const unit = extracted.units[0].replace(/^<source[^>]*>|<\/source>$/g, '');
        expect(keepsLiteralCodeIdentities(source, masked + ' ' + unit)).toBe(false);
    });
});
