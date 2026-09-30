import {describe, expect, it} from 'vitest';

import {maskLiteralCode, unmaskLiteralCode} from './literal-code';
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
