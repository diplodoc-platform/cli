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

    test.each([
        {mode: 'plain', args: '', baseHref: ''},
        {mode: 'workers', args: ' --jobs 2', baseHref: ''},
        {
            mode: 'publication-root',
            args: ' --base-href https://example.com/docs/ --skip-html-extension',
            baseHref: 'https://example.com/docs/',
        },
    ])(
        'resolves LLMS metadata per language and nearest TOC ($mode)',
        async ({mode, args, baseHref}) => {
            const {inputPath, outputPath} = getTestPaths('mocks/llms-toc');
            const modeOutputPath = `${outputPath}-${mode}`;
            await TestAdapter.testBuildPass(inputPath, modeOutputPath, {
                args: `--llms${args}`,
            });

            for (const directory of [modeOutputPath, `${modeOutputPath}-html`]) {
                const [english, russian, nested, full] = await Promise.all([
                    readFile(join(directory, 'en/llms.txt'), 'utf8'),
                    readFile(join(directory, 'ru/llms.txt'), 'utf8'),
                    readFile(join(directory, 'en/nested/llms.txt'), 'utf8'),
                    readFile(join(directory, 'en/llms-full.txt'), 'utf8'),
                ]);

                expect(english).toContain('> English summary.\n\nProject details.');
                expect(english).toContain('- Shared guidance.\n\n## Documentation');
                expect(english).toContain('Included');
                expect(english).not.toContain('Included summary');
                expect(english).not.toContain('Included details');
                expect(russian).toContain('> Project summary.\n\nRussian details.');
                expect(russian).not.toContain('Project details.');
                expect(nested).toContain('# Nested docs\n\n## Documentation');
                expect(nested).not.toContain('Project summary.');
                expect(nested).not.toContain('Project details.');
                expect(full).not.toContain('Shared guidance.');
            }

            for (const {page, url, markdownUrl = url} of [
                {page: 'en/index', url: 'https://example.com/en/llms.txt'},
                {page: 'ru/index', url: 'https://example.com/root/llms.txt'},
                {
                    page: 'en/nested/page',
                    url: `${baseHref}en/nested/llms.txt`,
                    markdownUrl: baseHref ? `${baseHref}en/nested/llms.txt` : 'llms.txt',
                },
            ]) {
                const markdown = await readFile(join(modeOutputPath, `${page}.md`), 'utf8');
                const companion = await readFile(
                    join(`${modeOutputPath}-html`, `${page}.md`),
                    'utf8',
                );
                const html = await readFile(join(`${modeOutputPath}-html`, `${page}.html`), 'utf8');
                for (const content of [markdown, companion]) {
                    expect(content).toContain(`href: ${markdownUrl}\n    rel: describedby`);
                }
                const describedby = html.match(/<link\b[^>]*rel="describedby"[^>]*>/)?.[0];
                expect(describedby).toContain(`href="${url}"`);
            }
        },
    );

    test('TOC URL overrides remain active with project generation disabled', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/llms-toc');
        const disabledOutputPath = `${outputPath}-disabled`;
        await TestAdapter.testBuildPass(inputPath, disabledOutputPath, {
            args: `-c ${join(inputPath, 'disabled.yfm')}`,
        });

        for (const directory of [disabledOutputPath, `${disabledOutputPath}-html`]) {
            await expect(access(join(directory, 'en/llms.txt'))).rejects.toThrow();
            const english = await readFile(join(directory, 'en/index.md'), 'utf8');
            const russian = await readFile(join(directory, 'ru/index.md'), 'utf8');
            const nested = await readFile(join(directory, 'en/nested/page.md'), 'utf8');
            expect(english).toContain('href: https://example.com/en/llms.txt');
            expect(russian).toContain('href: https://example.com/root/llms.txt');
            expect(nested).not.toContain('rel: describedby');
            if (directory.endsWith('-html')) {
                const englishHtml = await readFile(join(directory, 'en/index.html'), 'utf8');
                const russianHtml = await readFile(join(directory, 'ru/index.html'), 'utf8');
                const nestedHtml = await readFile(join(directory, 'en/nested/page.html'), 'utf8');
                expect(englishHtml).toContain(
                    'rel="describedby" href="https://example.com/en/llms.txt"',
                );
                expect(russianHtml).toContain(
                    'rel="describedby" href="https://example.com/root/llms.txt"',
                );
                expect(nestedHtml).not.toContain('rel="describedby"');
            }
        }
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
