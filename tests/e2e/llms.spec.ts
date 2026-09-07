import {access, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('llms.txt', () => {
    // Builds the same fixture in both md and html with `--llms` (variant B):
    //   - md  output -> `${outputPath}`      (llms-full.txt has includes merged)
    //   - html output -> `${outputPath}-html` (llms-full.txt keeps include directives)
    // The fixture also has per-page frontmatter descriptions (surfaced in
    // llms.txt), a toc-level `noIndex` page that is built but excluded from both
    // LLM artifacts, and a `when: showBeta` page that the default version filters
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

        const humanContent = await readFile(join(outputPath, 'llms-full.txt'), 'utf8');
        const agentContent = await readFile(join(outputPath, 'llms-full-agent.txt'), 'utf8');
        const staticContent = await readFile(join(`${outputPath}-html`, 'llms-full.txt'), 'utf8');

        expect(humanContent).toContain('Instructions for a human reader.');
        expect(humanContent).not.toContain('Instructions for an autonomous agent.');
        expect(agentContent).toContain('Instructions for an autonomous agent.');
        expect(agentContent).not.toContain('Instructions for a human reader.');
        expect(staticContent).toContain('Instructions for a human reader.');
        expect(staticContent).not.toContain('Instructions for an autonomous agent.');
        await expect(access(join(`${outputPath}-html`, 'llms-full-agent.txt'))).rejects.toThrow();
    });

    test('toc noIndex remains excluded with worker processing', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms');
        const jobsOutputPath = `${outputPath}-jobs`;

        await TestAdapter.testBuildPass(inputPath, jobsOutputPath, {
            md2md: true,
            md2html: false,
            args: '--llms --jobs 2',
        });

        const [index, full, api] = await Promise.all([
            readFile(join(jobsOutputPath, 'llms.txt'), 'utf8'),
            readFile(join(jobsOutputPath, 'llms-full.txt'), 'utf8'),
            readFile(join(jobsOutputPath, 'api.md'), 'utf8'),
        ]);

        expect(index).not.toContain('API Reference');
        expect(full).not.toContain('GET /things');
        expect(api).toContain('noIndex: true');
    });

    test('included toc noIndex propagates while hidden stays independent', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms-no-index');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--llms --jobs 2',
        });

        const [index, full, privatePage, hiddenPage] = await Promise.all([
            readFile(join(outputPath, 'llms.txt'), 'utf8'),
            readFile(join(outputPath, 'llms-full.txt'), 'utf8'),
            readFile(join(outputPath, '_includes/private/private.md'), 'utf8'),
            readFile(join(outputPath, 'hidden.md'), 'utf8'),
        ]);

        expect(index).toContain('Public page');
        expect(index).not.toContain('Included private page');
        expect(index).not.toContain('Hidden page');
        expect(full).toContain('Public content');
        expect(full).not.toContain('Private content');
        expect(full).not.toContain('Hidden content');
        expect(privatePage).toContain('noIndex: true');
        expect(hiddenPage).not.toContain('noIndex: true');
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
