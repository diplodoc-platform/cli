import {compose} from '@diplodoc/translation';
import transform from '@diplodoc/transform';
import {describe, expect, it} from 'vitest';

import {repairInlineSpacing} from './inline-spacing';

const group = (content: string, marker = '**', type = 'bold') =>
    `<g ctype="${type}" x-begin="${marker}" x-end="${marker}" id="g-1">${content}</g>`;
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
