import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('llms.txt', () => {
    // Builds the same fixture in both md and html with `--llms` (variant B):
    //   - md  output -> `${outputPath}`      (llms-full.txt has includes merged)
    //   - html output -> `${outputPath}-html` (llms-full.txt keeps include directives)
    // The fixture also has per-page frontmatter descriptions (surfaced in
    // llms.txt) and a `when: showBeta` page that the default version filters
    // out — proving the artifacts stay consistent with the built "version".
    test('generates llms.txt and llms-full.txt for md and html', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: true,
            args: '--llms',
        });

        await compareDirectories(outputPath);
        await compareDirectories(`${outputPath}-html`);
    });

    test('llms-full.txt respects --llms-full-max-size limit', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms');

        // Set a very small limit (1K) — after the first article
        // adding should stop, YFM022 is logged as info
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--llms --llms-full-max-size 1K',
        });

        // Verify that llms-full.txt exists and its size does not exceed the limit
        const fullContent = await readFile(join(outputPath, 'llms-full.txt'), 'utf8');
        const fullSize = Buffer.byteLength(fullContent, 'utf8');

        // The file should contain the title and at most one article
        expect(fullContent).toContain('# My Product');
        expect(fullSize).toBeLessThanOrEqual(1024);
    });

    test('llms-full.txt respects llms.llmsFullMaxSize from .yfm config', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms-max-size');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--llms',
        });

        // Verify that llms-full.txt exists and its size does not exceed the 2K limit
        const fullContent = await readFile(join(outputPath, 'llms-full.txt'), 'utf8');
        const fullSize = Buffer.byteLength(fullContent, 'utf8');

        expect(fullContent).toContain('# My Product');
        expect(fullSize).toBeLessThanOrEqual(2 * 1024);
    });
});
