import {describe, it, expect} from 'vitest';
import {addMetaFrontmatter} from './utils';

describe('addMetaFrontmatter', () => {
    it('should add YAML frontmatter to content', () => {
        const content = '# Title\n\nSome content';
        const meta = {__system: {version: '1.0'}};

        const result = addMetaFrontmatter(content, meta, undefined);

        expect(result).toContain('---');
        expect(result).toContain('__system:');
        expect(result).toContain('version:');
        expect(result).toContain('# Title');
    });

    it('should return content unchanged if meta is empty object', () => {
        const content = '# Title';
        const meta = {};

        const result = addMetaFrontmatter(content, meta, undefined);

        expect(result).toBe('# Title');
    });

    it('should format with custom lineWidth', () => {
        const content = '# Title';
        const meta = {
            description: 'A very long description that might need to be wrapped at some point',
        };

        const resultDefault = addMetaFrontmatter(content, meta, undefined);
        const resultShort = addMetaFrontmatter(content, meta, 40);

        // Both should have frontmatter
        expect(resultDefault).toContain('---');
        expect(resultShort).toContain('---');
    });

    it('should preserve complex metadata structure', () => {
        const content = '# Title';
        const meta = {
            __system: {
                version: '1.0',
                author: 'Test',
            },
            metadata: [{name: 'generator', content: 'Diplodoc'}],
            alternate: [{href: '/en/page.md'}],
        };

        const result = addMetaFrontmatter(content, meta, undefined);

        expect(result).toMatch(/^---\n/);
        expect(result).toContain('__system:');
        expect(result).toContain('metadata:');
        expect(result).toContain('alternate:');
        expect(result).toMatch(/---\n# Title$/);
    });
});
