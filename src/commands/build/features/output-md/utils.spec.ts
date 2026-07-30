import {describe, expect, it} from 'vitest';

import {addMetaFrontmatter, buildCompanionAlternate} from './utils';

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

describe('buildCompanionAlternate', () => {
    it('should build md companion alternate for a .md file', () => {
        const result = buildCompanionAlternate('ru/about.md' as NormalizedPath);

        expect(result.type).toBe('text/markdown');
        expect(result.title).toBe('Markdown version');
        // shortLink keeps the .md extension (companion points to the .md file)
        expect(result.href).toBe('ru/about.md');
    });

    it('should build yaml companion alternate for a .yaml file', () => {
        const result = buildCompanionAlternate('ru/index.yaml' as NormalizedPath);

        expect(result.type).toBe('application/yaml');
        expect(result.title).toBe('Yaml version');
        expect(result.href).toBe('ru/index.yaml');
    });

    it('should build yaml companion alternate for a .yml file', () => {
        const result = buildCompanionAlternate('ru/index.yml' as NormalizedPath);

        expect(result.type).toBe('application/yaml');
        expect(result.title).toBe('Yaml version');
        // setExt normalizes .yml to .yaml
        expect(result.href).toBe('ru/index.yaml');
    });

    it('should default to md companion for files without yaml extension', () => {
        const result = buildCompanionAlternate('ru/page.md' as NormalizedPath);

        expect(result.type).toBe('text/markdown');
        expect(result.title).toBe('Markdown version');
    });

    it('should produce a short link for index.md', () => {
        const result = buildCompanionAlternate('ru/index.md' as NormalizedPath);

        // shortLink converts /index to / but keeps .md extension
        expect(result.href).toBe('ru/index.md');
    });
});
