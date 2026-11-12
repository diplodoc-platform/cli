import {compose} from '@diplodoc/translation';
import transform from '@diplodoc/transform';
import {describe, expect, it} from 'vitest';

import {repairInlineSpacing} from './inline-spacing';

const group = (content: string, marker = '**', type = 'bold') =>
    `<g ctype="${type}" x-begin="${marker}" x-end="${marker}" id="g-1">${content}</g>`;
const paired = (content: string, marker = '**', type = 'bold') =>
    `<x ctype="${type}_open" equiv-text="${marker}" id="x-1"/>${content}<x ctype="${type}_close" equiv-text="${marker}" id="x-2"/>`;
const render = (text: string) =>
    String(
        compose('%%%0%%%', [`<source xml:space="preserve">${text}</source>`], {useSource: true}),
    );
const inlineTypes = (text: string) =>
    transform(render(text), {tokens: true}).flatMap((t) => t.children?.map((c) => c.type) ?? []);

describe('repairInlineSpacing', () => {
    it('realizes bold after translated punctuation without changing words or XML', () => {
        const original = group('标签：') + '返回值。',
            repaired = repairInlineSpacing(original);
        expect(inlineTypes(original)).not.toContain('strong_open');
        expect(inlineTypes(repaired)).toContain('strong_open');
        expect(render(repaired)).toBe('**标签：** 返回值。');
        expect(repaired.replace(/\s/g, '')).toBe(original.replace(/\s/g, ''));
        expect(repairInlineSpacing(repaired)).toBe(repaired);
    });
    it('realizes an opening delimiter next to translated prose', () => {
        const repaired = repairInlineSpacing('说明' + group('（标签）'));
        expect(inlineTypes(repaired)).toContain('strong_open');
        expect(render(repaired)).toBe('说明 **（标签）**');
    });
    it('handles underscore emphasis without merging it into adjacent words', () => {
        const repaired = repairInlineSpacing('前' + group('标签', '__') + '后');
        expect(inlineTypes(repaired)).toContain('strong_open');
        expect(render(repaired)).toBe('前 __标签__ 后');
    });
    it.each([
        ['**', 'bold', 'strong_open'],
        ['__', 'bold', 'strong_open'],
        ['*', 'italic', 'em_open'],
        ['_', 'italic', 'em_open'],
    ])('realizes paired %s placeholders at a punctuation boundary', (marker, type, token) => {
        const original = paired('标签：', marker, type) + '返回值。';
        const repaired = repairInlineSpacing(original);
        expect(inlineTypes(original)).not.toContain(token);
        expect(inlineTypes(repaired)).toContain(token);
        expect(render(repaired)).toBe(`${marker}标签：${marker} 返回值。`);
        expect(repaired.replace(/\s/g, '')).toBe(original.replace(/\s/g, ''));
        expect(repairInlineSpacing(repaired)).toBe(repaired);
    });
    it.each([
        paired('Label:') + ' next.',
        paired('Cost€') + 'next',
        '<g ctype="code">' + paired('标签：') + '返回值。</g>',
        paired('标签：').replace('bold_close', 'italic_close') + '返回值。',
        paired('标签：').replace(
            'ctype="bold_close" equiv-text="**"',
            'ctype="bold_close" equiv-text="__"',
        ) + '返回值。',
        '<x ctype="bold_close" equiv-text="**" id="x-2"/>返回值。',
        '<x ctype="bold_open" equiv-text="**" id="x-1"/>标签：',
    ])('does not alter valid, code or unbalanced paired placeholders: %s', (text) => {
        expect(repairInlineSpacing(text)).toBe(text);
    });
    it.each([
        paired(group('标签', '*', 'italic')) + '返回',
        paired(paired('Label', '*', 'italic').replace(/x-1/g, 'x-3').replace(/x-2/g, 'x-4')) +
            'next',
        group(paired('标签', '*', 'italic')) + '返回',
    ])('preserves already valid merged nested delimiter runs byte for byte: %s', (text) => {
        expect(inlineTypes(text)).toContain('strong_open');
        expect(inlineTypes(text)).toContain('em_open');
        expect(repairInlineSpacing(text)).toBe(text);
    });
    it('repairs a merged nested closing run when its content ends with punctuation', () => {
        const text = paired(group('标签：', '*', 'italic')) + '返回';
        const repaired = repairInlineSpacing(text);
        expect(render(repaired)).toBe('***标签：*** 返回');
        expect(inlineTypes(repaired)).toContain('strong_open');
        expect(inlineTypes(repaired)).toContain('em_open');
    });
    it('keeps underscore intraword rules for a merged nested run', () => {
        const text = '前' + paired(group('标签', '_', 'italic'), '__') + '后';
        const repaired = repairInlineSpacing(text);
        expect(render(repaired)).toBe('前 ___标签___ 后');
        expect(inlineTypes(repaired)).toContain('strong_open');
        expect(inlineTypes(repaired)).toContain('em_open');
    });
    it.each([
        group('标签') + '返回。',
        group('标签：') + '，返回。',
        group('Label:') + ' next.',
        group('code:', '`', 'code') + 'next',
        '<g ctype="bold" x-begin="**" x-end="**">unclosed',
    ])('leaves already valid or unsupported markup unchanged: %s', (text) => {
        expect(repairInlineSpacing(text)).toBe(text);
    });
});

describe('parser punctuation semantics', () => {
    it.each([
        'Amount' + group('€100'),
        group('Cost€') + 'next',
        '😀' + group('Label'),
        group('Label') + '😀',
        '€' + group('€100'),
    ])('preserves an already valid symbol boundary byte for byte: %s', (text) => {
        expect(inlineTypes(text)).toContain('strong_open');
        expect(repairInlineSpacing(text)).toBe(text);
    });
});
