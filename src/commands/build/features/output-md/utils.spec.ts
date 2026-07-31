import {describe, expect, it} from 'vitest';

import {
    addMetaFrontmatter,
    buildAlternateEntries,
    buildCompanionAlternate,
    buildLlmsAlternate,
} from './utils';

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

describe('buildLlmsAlternate', () => {
    const file = 'ru/about.md' as NormalizedPath;
    const tocDir = 'ru' as NormalizedPath;

    it('should use llms.url when set (absolute href)', () => {
        const result = buildLlmsAlternate(
            {enabled: true, url: 'https://example.com/llms.txt'},
            file,
            tocDir,
        );

        expect(result).not.toBeNull();
        expect(result!.href).toBe('https://example.com/llms.txt');
        expect(result!.type).toBe('text/markdown');
        expect(result!.title).toBe('llms.txt');
    });

    it('should use llms.url even when enabled is false', () => {
        const result = buildLlmsAlternate(
            {enabled: false, url: 'https://example.com/llms.txt'},
            file,
            tocDir,
        );

        expect(result).not.toBeNull();
        expect(result!.href).toBe('https://example.com/llms.txt');
    });

    it('should use relative llms.txt when enabled is true and no url', () => {
        const result = buildLlmsAlternate({enabled: true}, file, tocDir);

        expect(result).not.toBeNull();
        expect(result!.href).toBe('llms.txt');
        expect(result!.type).toBe('text/markdown');
        expect(result!.title).toBe('llms.txt');
    });

    it('should compute relative path for pages in subdirectories', () => {
        const deepFile = 'ru/deep/test.md' as NormalizedPath;
        const result = buildLlmsAlternate({enabled: true}, deepFile, tocDir);

        expect(result).not.toBeNull();
        expect(result!.href).toBe('../llms.txt');
    });

    it('should return null when enabled is false and no url', () => {
        const result = buildLlmsAlternate({enabled: false}, file, tocDir);

        expect(result).toBeNull();
    });

    it('should return null when llms config is undefined', () => {
        const result = buildLlmsAlternate(undefined, file, tocDir);

        expect(result).toBeNull();
    });
});

describe('buildAlternateEntries', () => {
    const file = 'ru/about.md' as NormalizedPath;
    const tocDir = 'ru' as NormalizedPath;

    it('should return companion + llms entries for a regular md file with llms enabled', () => {
        const entries = buildAlternateEntries(file, tocDir, {enabled: true});

        expect(entries).toHaveLength(2);
        expect(entries[0].type).toBe('text/markdown');
        expect(entries[0].title).toBe('Markdown version');
        expect(entries[1].type).toBe('text/markdown');
        expect(entries[1].title).toBe('llms.txt');
    });

    it('should return only companion entry when llms is disabled', () => {
        const entries = buildAlternateEntries(file, tocDir, {enabled: false});

        expect(entries).toHaveLength(1);
        expect(entries[0].title).toBe('Markdown version');
    });

    it('should return only companion entry when llms config is undefined', () => {
        const entries = buildAlternateEntries(file, tocDir, undefined);

        expect(entries).toHaveLength(1);
        expect(entries[0].title).toBe('Markdown version');
    });

    it('should return empty array for include files', () => {
        const includeFile = 'ru/_includes/level1.md' as NormalizedPath;
        const entries = buildAlternateEntries(includeFile, tocDir, {enabled: true});

        expect(entries).toHaveLength(0);
    });

    it('should return empty array for include files at root', () => {
        const includeFile = '_includes/level1.md' as NormalizedPath;
        const entries = buildAlternateEntries(includeFile, tocDir, {enabled: true});

        expect(entries).toHaveLength(0);
    });

    it('should include llms.url entry when set', () => {
        const entries = buildAlternateEntries(file, tocDir, {
            enabled: false,
            url: 'https://example.com/llms.txt',
        });

        expect(entries).toHaveLength(2);
        expect(entries[1].href).toBe('https://example.com/llms.txt');
    });

    it('should compute relative llms.txt path for subdirectory pages', () => {
        const deepFile = 'ru/deep/test.md' as NormalizedPath;
        const entries = buildAlternateEntries(deepFile, tocDir, {enabled: true});

        expect(entries).toHaveLength(2);
        expect(entries[1].href).toBe('../llms.txt');
    });
});
