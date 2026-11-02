import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'node-html-parser';
import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Merge includes (md2md)', () => {
    test('basic: simple include is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('nested: outer inlined, inner as fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/nested');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('relative-paths: inlined content has rebased paths', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/relative-paths');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('hash-section: includes with hash extract sections inline', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/hash-fallback');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('term-inline: includes inside term defs use fallback (not inlined)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/term-inline');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes --multiline-term-definitions',
        });
        await compareDirectories(outputPath);
    });

    test('inline-context: non-standalone includes use fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/inline-context');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('term-extract: dep with terms → terms extracted, content inlined (Step 4)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/term-extract');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes --multiline-term-definitions',
        });
        await compareDirectories(outputPath);
    });

    test.each([true, false])(
        'nested terms: preserve tabs and following content through md2md → md2html (source maps: %s)',
        async (sourceMaps) => {
            const paths = getTestPaths('mocks/merge-includes/nested-terms');
            const outputPath = `${paths.outputPath}-${sourceMaps ? 'source-maps' : 'plain'}`;
            const args = [
                '--merge-includes',
                '--multiline-term-definitions',
                sourceMaps ? '--merge-includes-source-maps' : '--no-merge-includes-source-maps',
            ];

            await TestAdapter.testBuildPass(paths.inputPath, outputPath, {
                md2md: true,
                md2html: false,
                args: args.join(' '),
            });

            for (const page of ['index', 'section']) {
                const markdown = readFileSync(join(outputPath, `${page}.md`), 'utf8');
                expect(markdown).toContain('After the include.');
                expect(markdown).toContain('VISIBLE FINAL INSTRUCTION.');
                expect(markdown.indexOf('[*web]:')).toBeGreaterThan(
                    markdown.indexOf('VISIBLE FINAL INSTRUCTION.'),
                );
                expect(markdown.trimEnd()).toMatch(/\n\[\*web\]: Definition of Web App\.$/);

                if (page === 'section') {
                    expect(markdown).not.toContain('OMITTED INSTRUCTIONS.');
                }
            }

            const htmlReport = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
                ...args,
                '-f',
                'html',
                '--static-content',
            ]);

            expect(htmlReport.code).toBe(0);
            expect(htmlReport.errors).toEqual([]);
            expect(htmlReport.warns).toEqual([]);

            for (const page of ['index', 'section']) {
                const html = parse(
                    readFileSync(join(`${outputPath}-html`, `${page}.html`), 'utf8'),
                );
                expect(html.querySelectorAll('[role="tablist"]')).toHaveLength(1);

                const finalHeading = html
                    .querySelectorAll('h2')
                    .find((heading) => heading.textContent.includes('Finish'));
                expect(finalHeading).toBeDefined();
                expect(finalHeading?.closest('dfn')).toBeNull();
                expect(html.querySelectorAll('dfn')).toHaveLength(1);
                expect(html.querySelector('dfn')?.textContent.trim()).toBe(
                    'Definition of Web App.',
                );
            }
        },
    );

    test('nested terms: preserve a fallback include inside a hoisted definition', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/nested-term-fallback');
        const args = [
            '--merge-includes',
            '--multiline-term-definitions',
            '--no-merge-includes-source-maps',
        ];

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: args.join(' '),
        });

        const markdown = readFileSync(join(outputPath, 'index.md'), 'utf8');
        expect(markdown).toContain('{% included (_includes/details.md) %}');
        expect(markdown).toContain('- **Required**: Nested term detail.');
        expect(markdown.indexOf('[*web]:')).toBeGreaterThan(
            markdown.indexOf('VISIBLE FINAL INSTRUCTION.'),
        );

        const htmlReport = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
            ...args,
            '-f',
            'html',
            '--static-content',
        ]);

        expect(htmlReport.code).toBe(0);
        expect(htmlReport.errors).toEqual([]);
        expect(htmlReport.warns).toEqual([]);

        const html = parse(readFileSync(join(`${outputPath}-html`, 'index.html'), 'utf8'));
        expect(html.querySelector('dfn')?.textContent).toContain('Nested term detail.');

        const finalHeading = html
            .querySelectorAll('h2')
            .find((heading) => heading.textContent.includes('Finish'));
        expect(finalHeading).toBeDefined();
        expect(finalHeading?.closest('dfn')).toBeNull();
    });

    test('yfm-table: include followed by || separator is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/yfm-table');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('yfm-table: include ending with HTML block places || on its own line', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/yfm-table-html-block');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('yfm-table: include with `|` in inline code falls back to {% included %}', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/yfm-table-pipe-in-content',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('indent-paragraph: include under indent with indented top-level paragraph falls back to {% included %}', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/indent-paragraph-in-include',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('html-in-list: include with <style> in list (any indent) uses fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/html-in-list');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('hash-section-html: hash-section include in list is inlined when only other section has <style>', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/hash-section-html');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('without flag: includes are NOT merged', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--no-merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('html-comment-blanks: blank lines inside HTML comments keep list/cut continuity', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/html-comment-blanks');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('include-in-code-block: include shown as code example is NOT expanded', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/include-in-code-block');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('include-after-fence: include placed right after a closing ``` fence is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/include-after-fence');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('empty-parent-frontmatter: empty parent (only include) inherits the include frontmatter', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/empty-parent-frontmatter',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('empty-parent-frontmatter-chain: frontmatter is propagated through a chain of empty includes', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/empty-parent-frontmatter-chain',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });
});
