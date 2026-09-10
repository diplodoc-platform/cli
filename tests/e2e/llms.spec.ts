import {readFile} from 'node:fs/promises';
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

    test.each([
        {mode: 'plain', args: ''},
        {mode: 'workers', args: ' --jobs 2'},
    ])(
        'included toc noIndex excludes shared pages while hidden stays independent ($mode)',
        async ({mode, args}) => {
            const {inputPath, outputPath} = getTestPaths('mocks/llms-no-index');
            const modeOutputPath = `${outputPath}-${mode}`;

            await TestAdapter.testBuildPass(inputPath, modeOutputPath, {
                md2md: true,
                md2html: true,
                args: `--llms${args}`,
            });

            for (const {directory, extension, noIndex} of [
                {directory: modeOutputPath, extension: 'md', noIndex: 'noIndex: true'},
                {directory: `${modeOutputPath}-html`, extension: 'html', noIndex: '"noIndex":true'},
            ]) {
                const [index, full, privatePage, hiddenPage] = await Promise.all([
                    readFile(join(directory, 'llms.txt'), 'utf8'),
                    readFile(join(directory, 'llms-full.txt'), 'utf8'),
                    readFile(join(directory, `_includes/private/private.${extension}`), 'utf8'),
                    readFile(join(directory, `hidden.${extension}`), 'utf8'),
                ]);

                expect(index).toContain('Public page');
                expect(index).not.toContain('Shared private page');
                expect(index).not.toContain('Included private page');
                expect(index).not.toContain('Hidden page');
                expect(full).toContain('Public content');
                expect(full).not.toContain('Private content');
                expect(full).not.toContain('Hidden content');
                expect(privatePage).toContain(noIndex);
                expect(hiddenPage).not.toContain(noIndex);
            }
        },
    );

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
