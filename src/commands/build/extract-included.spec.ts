import {describe, expect, it} from 'vitest';

import {extractIncludedBlocks} from './extract-included';

describe('extractIncludedBlocks', () => {
    it('should extract a single included block', () => {
        const content = [
            '# Main',
            '',
            '{% include [chapter](_includes/chapter.md) %}',
            '',
            '{% included (_includes/chapter.md) %}',
            '## Chapter Content',
            '',
            'Some text here.',
            '{% endincluded %}',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.content).toBe(
            ['# Main', '', '{% include [chapter](_includes/chapter.md) %}', ''].join('\n'),
        );
        expect(result.files).toEqual({
            '_includes/chapter.md': '## Chapter Content\n\nSome text here.',
        });
    });

    it('should extract multiple included blocks', () => {
        const content = [
            '# Main',
            '{% include [a](_includes/a.md) %}',
            '{% include [b](_includes/b.md) %}',
            '{% included (_includes/a.md) %}',
            'Content A',
            '{% endincluded %}',
            '{% included (_includes/b.md) %}',
            'Content B',
            '{% endincluded %}',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.files['_includes/a.md' as NormalizedPath]).toBe('Content A');
        expect(result.files['_includes/b.md' as NormalizedPath]).toBe('Content B');
    });

    it('should resolve colon-chain keys for nested includes', () => {
        const content = [
            '{% include [outer](_includes/outer.md) %}',
            '{% included (_includes/outer.md) %}',
            'Outer content',
            '{% endincluded %}',
            '{% included (_includes/outer.md:inner.md) %}',
            'Inner content',
            '{% endincluded %}',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.files['_includes/outer.md' as NormalizedPath]).toBe('Outer content');
        expect(result.files['_includes/inner.md' as NormalizedPath]).toBe('Inner content');
    });

    it('should resolve colon-chain keys relative to parent path', () => {
        const content = ['{% included (sub/file.md) %}', 'File content', '{% endincluded %}'].join(
            '\n',
        );

        const result = extractIncludedBlocks(content, 'en/docs/page.md' as NormalizedPath);

        expect(result.files['en/docs/sub/file.md' as NormalizedPath]).toBe('File content');
    });

    it('should return content unchanged when no included blocks', () => {
        const content = '# Title\n\nSome text.';
        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.content).toBe(content);
        expect(result.files).toEqual({});
    });

    it('should handle empty included blocks', () => {
        const content = ['# Main', '{% included (_includes/empty.md) %}', '{% endincluded %}'].join(
            '\n',
        );

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.files['_includes/empty.md' as NormalizedPath]).toBe('');
    });

    it('should handle included blocks with multiline content', () => {
        const content = [
            '{% included (_includes/multi.md) %}',
            '# Title',
            '',
            'Paragraph 1',
            '',
            'Paragraph 2',
            '{% endincluded %}',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.files['_includes/multi.md' as NormalizedPath]).toBe(
            '# Title\n\nParagraph 1\n\nParagraph 2',
        );
    });

    it('should resolve deeply nested colon-chain keys', () => {
        const content = [
            '{% included (a/b.md:c/d.md:e.md) %}',
            'Deep content',
            '{% endincluded %}',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'root.md' as NormalizedPath);

        // root.md → a/b.md → a/c/d.md → a/c/e.md
        expect(result.files['a/c/e.md' as NormalizedPath]).toBe('Deep content');
    });

    it('should preserve content before and after included blocks', () => {
        const content = [
            'Line before',
            '{% included (inc.md) %}',
            'Included',
            '{% endincluded %}',
            'Line after',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.content).toBe('Line before\nLine after');
        expect(result.files['inc.md' as NormalizedPath]).toBe('Included');
        expect(result.errors).toEqual([]);
    });

    it('should report error when endincluded is missing', () => {
        const content = [
            '# Main',
            '{% included (_includes/broken.md) %}',
            'Content without closing tag',
            'More content',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'docs/page.md' as NormalizedPath);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('docs/page.md');
        expect(result.errors[0]).toContain('line 2');
        expect(result.errors[0]).toContain('_includes/broken.md');
        expect(result.errors[0]).toContain('missing {% endincluded %}');
        expect(result.files['docs/_includes/broken.md' as NormalizedPath]).toBe(
            'Content without closing tag\nMore content',
        );
    });

    it('should report errors for multiple unclosed blocks', () => {
        const content = [
            '{% included (a.md) %}',
            'Content A',
            '{% endincluded %}',
            '{% included (b.md) %}',
            'Content B without end',
        ].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('line 4');
        expect(result.errors[0]).toContain('b.md');
        expect(result.files['a.md' as NormalizedPath]).toBe('Content A');
        expect(result.files['b.md' as NormalizedPath]).toBe('Content B without end');
    });

    it('should return empty errors when all blocks are closed', () => {
        const content = ['{% included (a.md) %}', 'Content', '{% endincluded %}'].join('\n');

        const result = extractIncludedBlocks(content, 'main.md' as NormalizedPath);
        expect(result.errors).toEqual([]);
    });
});
