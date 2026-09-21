import {access, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, cleanupDirectory, getTestPaths} from '../fixtures';

const PAGE_PATHS = ['index.md', 'nested/article.md', 'landing.yaml'];

describe('static Markdown companions', () => {
    test('renders md2md-equivalent companions during one HTML build', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/companions');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: true,
            args: '--llms --base-href https://example.com/docs/',
        });

        for (const path of PAGE_PATHS) {
            const expected = await readFile(join(outputPath, path), 'utf8');
            const actual = await readFile(join(`${outputPath}-html`, path), 'utf8');
            expect(actual).toBe(expected);
        }

        await expect(access(join(`${outputPath}-html`, '_includes/shared.md'))).rejects.toThrow();

        const html = await readFile(join(`${outputPath}-html`, 'index.html'), 'utf8');
        expect(html).toContain(
            '<link rel="alternate" href="https://example.com/docs/index.md" type="text/markdown" title="Markdown version" />',
        );

        const llms = await readFile(join(`${outputPath}-html`, 'llms.txt'), 'utf8');
        expect(llms).toContain('(https://example.com/docs/index.md)');
        expect(llms).toContain('(https://example.com/docs/nested/article.md)');
        expect(llms).toContain('(https://example.com/docs/landing.yaml)');
        expect(llms).not.toContain('.html)');

        const audience = await readFile(join(`${outputPath}-html`, 'audience.md'), 'utf8');
        expect(audience).toContain('Visible to a human reader.');
        expect(audience).not.toContain('Visible to an autonomous agent.');

        const fallback = await readFile(join(`${outputPath}-html`, 'fallback.md'), 'utf8');
        expect(fallback).toContain('Public page content.');
        expect(fallback).not.toContain('Agent-only fallback secret');
        expect(fallback).not.toContain('{% included (_includes/agent-secret.md) %}');

        const llmsFull = await readFile(join(`${outputPath}-html`, 'llms-full.txt'), 'utf8');
        expect(llmsFull).not.toContain('Agent-only fallback secret');
    });

    test('keeps includes internal when mergeIncludes is disabled for the HTML build', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/companions-unmerged');
        await cleanupDirectory(outputPath);

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
        expect(report.code).toBe(0);

        const companion = await readFile(join(outputPath, 'index.md'), 'utf8');
        expect(companion).toContain('Include stays internal to the companion.');
        await expect(access(join(outputPath, '_includes/shared.md'))).rejects.toThrow();
    });

    test('does not emit companions unless explicitly enabled', async () => {
        const {outputPath} = getTestPaths('mocks/companions-disabled');
        await cleanupDirectory(outputPath);

        const sourcePath = getTestPaths('mocks/companions').inputPath;
        const report = await TestAdapter.build.run(sourcePath, outputPath, [
            '-f',
            'html',
            '--no-companions',
        ]);
        expect(report.code).toBe(0);

        for (const path of PAGE_PATHS) {
            await expect(access(join(outputPath, path))).rejects.toThrow();
        }
        await expect(access(join(outputPath, 'audience.md'))).rejects.toThrow();
    });
});
