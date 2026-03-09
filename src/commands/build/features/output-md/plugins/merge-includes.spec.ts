import {describe, expect, it} from 'vitest';

import {rebaseRelativePaths, rebaseUrl} from './merge-includes';

describe('rebaseUrl', () => {
    it('should rebase a simple relative path', () => {
        expect(rebaseUrl('image.png', '_includes', '.')).toBe('_includes/image.png');
    });

    it('should rebase a relative path with subdirectory', () => {
        expect(rebaseUrl('./screenshot.png', 'docs/_includes', 'docs')).toBe(
            '_includes/screenshot.png',
        );
    });

    it('should rebase a parent-relative path', () => {
        expect(rebaseUrl('../images/photo.png', 'docs/_includes', 'docs')).toBe('images/photo.png');
    });

    it('should preserve hash fragment', () => {
        expect(rebaseUrl('other.md#section', '_includes', '.')).toBe('_includes/other.md#section');
    });

    it('should preserve search query', () => {
        expect(rebaseUrl('page.md?v=1', '_includes', '.')).toBe('_includes/page.md?v=1');
    });

    it('should preserve both hash and search', () => {
        expect(rebaseUrl('page.md?v=1#sec', '_includes', '.')).toBe('_includes/page.md?v=1#sec');
    });

    it('should return null for external URLs', () => {
        expect(rebaseUrl('https://example.com/page', '_includes', '.')).toBeNull();
        expect(rebaseUrl('http://example.com', '_includes', '.')).toBeNull();
    });

    it('should return null for absolute paths', () => {
        expect(rebaseUrl('/absolute/path.md', '_includes', '.')).toBeNull();
    });

    it('should return null for anchor-only URLs', () => {
        expect(rebaseUrl('#section', '_includes', '.')).toBeNull();
    });

    it('should return null for empty path with hash', () => {
        expect(rebaseUrl('#', '_includes', '.')).toBeNull();
    });

    it('should handle same directory (no rebase needed)', () => {
        expect(rebaseUrl('file.md', 'docs', 'docs')).toBe('file.md');
    });

    it('should handle deeply nested paths', () => {
        expect(rebaseUrl('../../root.md', 'a/b/c', '.')).toBe('a/root.md');
    });

    it('should return null for protocol-relative URLs', () => {
        expect(rebaseUrl('//cdn.example.com/file.js', '_includes', '.')).toBeNull();
    });

    it('should return null for mailto links', () => {
        expect(rebaseUrl('mailto:test@example.com', '_includes', '.')).toBeNull();
    });
});

describe('rebaseRelativePaths', () => {
    const from = '_includes/chapter.md' as NormalizedPath;
    const to = 'main.md' as NormalizedPath;

    it('should rebase inline links', () => {
        const content = 'See [docs](./guide.md) for details.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('See [docs](_includes/guide.md) for details.');
    });

    it('should rebase inline images', () => {
        const content = '![screenshot](./images/screen.png)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('![screenshot](_includes/images/screen.png)');
    });

    it('should rebase link definitions', () => {
        const content = '[ref]: ./guide.md "Guide"';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[ref]: _includes/guide.md "Guide"');
    });

    it('should not rebase external URLs', () => {
        const content = '[link](https://example.com)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](https://example.com)');
    });

    it('should not rebase absolute paths', () => {
        const content = '[link](/absolute/path.md)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](/absolute/path.md)');
    });

    it('should not rebase anchor-only links', () => {
        const content = '[link](#section)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](#section)');
    });

    it('should preserve hash in rebased links', () => {
        const content = '[link](./guide.md#intro)';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](_includes/guide.md#intro)');
    });

    it('should not modify content inside fenced code blocks (backticks)', () => {
        const content = [
            'Before code.',
            '```markdown',
            '[link](./should-not-rebase.md)',
            '```',
            'After code.',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./should-not-rebase.md)');
        expect(result).toContain('Before code.');
        expect(result).toContain('After code.');
    });

    it('should not modify content inside fenced code blocks (tildes)', () => {
        const content = ['~~~', '[link](./should-not-rebase.md)', '~~~'].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./should-not-rebase.md)');
    });

    it('should handle code blocks with language specifier', () => {
        const content = [
            '```typescript',
            'const url = "[link](./not-a-real-link.md)";',
            '```',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./not-a-real-link.md)');
    });

    it('should handle multiple links on the same line', () => {
        const content = 'See [a](./a.md) and [b](./b.md).';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('See [a](_includes/a.md) and [b](_includes/b.md).');
    });

    it('should return content unchanged when source and target are in the same directory', () => {
        const sameDirFrom = 'docs/chapter.md' as NormalizedPath;
        const sameDirTo = 'docs/main.md' as NormalizedPath;
        const content = '[link](./guide.md)';
        const result = rebaseRelativePaths(content, sameDirFrom, sameDirTo);
        expect(result).toBe('[link](./guide.md)');
    });

    it('should handle empty content', () => {
        const result = rebaseRelativePaths('', from, to);
        expect(result).toBe('');
    });

    it('should handle content with no links', () => {
        const content = '# Title\n\nJust some text.';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('# Title\n\nJust some text.');
    });

    it('should handle links with title attributes', () => {
        const content = '[link](./guide.md "Guide Title")';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('[link](_includes/guide.md "Guide Title")');
    });

    it('should rebase correctly across multiple directory levels', () => {
        const deepFrom = 'a/b/c/deep.md' as NormalizedPath;
        const shallowTo = 'root.md' as NormalizedPath;
        const content = '[link](./local.md)';
        const result = rebaseRelativePaths(content, deepFrom, shallowTo);
        expect(result).toBe('[link](a/b/c/local.md)');
    });

    it('should handle indented link definitions', () => {
        const content = '  [ref]: ./guide.md';
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toBe('  [ref]: _includes/guide.md');
    });

    it('should handle code blocks after regular content', () => {
        const content = [
            '[before](./a.md)',
            '',
            '```',
            '[inside](./b.md)',
            '```',
            '',
            '[after](./c.md)',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[before](_includes/a.md)');
        expect(result).toContain('[inside](./b.md)');
        expect(result).toContain('[after](_includes/c.md)');
    });

    it('should handle 4+ backtick fences correctly', () => {
        const content = [
            '````',
            '```',
            '[link](./inside-nested.md)',
            '```',
            '````',
            '[link](./outside.md)',
        ].join('\n');
        const result = rebaseRelativePaths(content, from, to);
        expect(result).toContain('[link](./inside-nested.md)');
        expect(result).toContain('[link](_includes/outside.md)');
    });
});
