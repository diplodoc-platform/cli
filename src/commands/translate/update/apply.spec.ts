import {describe, expect, it} from 'vitest';

import {applyTargetEdits} from './apply';
import {extractRawBlocks} from './ranges';
describe('raw target edits', () => {
    it('preserves CRLF, non-ASCII text and terminal newline absence', () => {
        const input = 'Intro\r\n\r\nOld\r\n\r\nKeep `код`';
        expect(
            applyTargetEdits(input, [{start: 9, end: 12, expected: 'Old', replacement: 'New'}]),
        ).toBe('Intro\r\n\r\nNew\r\n\r\nKeep `код`');
        expect(applyTargetEdits(input, [])).toBe(input);
    });
    it('rejects stale expected content', () => {
        expect(() =>
            applyTargetEdits('human edit', [
                {start: 0, end: 5, expected: 'other', replacement: ''},
            ]),
        ).toThrow();
    });
    it('rejects overlapping edits', () => {
        expect(() =>
            applyTargetEdits('abcdef', [
                {start: 0, end: 3, expected: 'abc', replacement: ''},
                {start: 2, end: 4, expected: 'cd', replacement: ''},
            ]),
        ).toThrow();
    });
    it('does not mistake fenced headings for document headings', () => {
        const input = '# Title\r\n\r\n```md\r\n# Example\r\n```\r\n\r\nТекст';
        const blocks = extractRawBlocks(input);
        expect(blocks.map(({kind, text}) => ({kind, text}))).toEqual([
            {kind: 'heading', text: '# Title'},
            {kind: 'opaque', text: '```md\r\n# Example\r\n```'},
            {kind: 'paragraph', text: 'Текст'},
        ]);
        for (const block of blocks) {
            expect(input.slice(block.start, block.end)).toBe(block.text);
        }
    });
    it('keeps YFM containers opaque', () => {
        expect(
            extractRawBlocks('{% cut "Title" %}\n\nText\n\n{% endcut %}').every(
                (b) => b.kind === 'opaque',
            ),
        ).toBe(true);
    });
});
