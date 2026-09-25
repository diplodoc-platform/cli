import {describe, expect, test} from 'vitest';
import {join} from 'node:path';
import {access, readFile} from 'node:fs/promises';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Sitemap', () => {
    test('generates sitemap.xml with absolute urls for html build', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/sitemap/base');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '--sitemap --base-href https://example.com/docs/',
        });

        const sitemap = await readFile(join(outputPath, 'sitemap.xml'), 'utf-8');

        expect(sitemap).toContain('<loc>https://example.com/docs/ru/index.html</loc>');
        expect(sitemap).toContain('<loc>https://example.com/docs/ru/guide.html</loc>');
        // Pages with `noIndex` must not reach the sitemap.
        expect(sitemap).not.toContain('secret');
    });

    test('does not generate sitemap.xml for md build', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/sitemap/base');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--sitemap --base-href https://example.com/docs/',
        });

        await expect(access(join(outputPath, 'sitemap.xml'))).rejects.toThrow();
    });

    test('skips generation when baseHref is not provided', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/sitemap/base');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '--sitemap',
        });

        await expect(access(join(outputPath, 'sitemap.xml'))).rejects.toThrow();
    });

    test('reads sitemap and baseHref settings from .yfm config file', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/sitemap/config');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        const sitemap = await readFile(join(outputPath, 'sitemap.xml'), 'utf-8');

        expect(sitemap).toContain('<loc>https://config.example.com/docs/ru/index.html</loc>');
    });

    test('does not generate sitemap.xml when the flag is absent', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/sitemap/base');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        await expect(access(join(outputPath, 'sitemap.xml'))).rejects.toThrow();
    });
});
