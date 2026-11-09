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

    test.each([true, false])(
        'section terms: preserve references and definition scopes through md2md → md2html (source maps: %s)',
        async (sourceMaps) => {
            const paths = getTestPaths('mocks/merge-includes/section-term-references');
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

            const htmlReport = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
                ...args,
                '-f',
                'html',
                '--static-content',
            ]);

            expect(htmlReport.code).toBe(0);
            expect(htmlReport.errors).toEqual([]);
            // Nested terms render correctly, but the linter discourages definitions
            // that reference another term. Keep these diagnostics fixture-specific.
            expect(
                htmlReport.warns
                    .map((warning) =>
                        warning.replace(
                            /^WARN chained-conflict\.md: \d+: /,
                            'WARN chained-conflict.md: ',
                        ),
                    )
                    .sort(),
            ).toEqual([
                'WARN chained-conflict.md: YFM007 / term-used-without-definition ' +
                    'Term used without definition [Context: "[*api]: Related [SDK](*sdk)."]',
                'WARN chained-conflict.md: YFM008 / term-inside-definition-not-allowed ' +
                    'Term inside definition not allowed',
            ]);

            const readHtml = (page: string) =>
                parse(readFileSync(join(`${outputPath}-html`, `${page}.html`), 'utf8'), {
                    // Parse code children so interactive terms inside fences are checked too.
                    blockTextElements: {script: true, style: true, noscript: true},
                });

            for (const {page, key, definition, insideCode} of [
                {
                    page: 'index',
                    key: 'api',
                    definition: 'Definition used by the parent page.',
                    insideCode: false,
                },
                {
                    page: 'fenced',
                    key: 'api',
                    definition: 'Definition used only inside a code block.',
                    insideCode: true,
                },
                {
                    page: 'spaces',
                    key: 'api key',
                    definition: 'Definition with a space in its key.',
                    insideCode: false,
                },
            ]) {
                const markdown = readFileSync(join(outputPath, `${page}.md`), 'utf8');
                expect(markdown).toContain(`[*${key}]: ${definition}`);
                expect(markdown).not.toContain('OMITTED INSTRUCTIONS.');

                const html = readHtml(page);
                const titles = html.querySelectorAll('.yfm-term_title');
                const definitions = html.querySelectorAll('dfn');
                expect(titles).toHaveLength(1);
                expect(definitions).toHaveLength(1);
                expect(titles[0].getAttribute('term-key')).toBe(`:${key}`);
                expect(definitions[0].getAttribute('id')).toBe(`:${key}_element`);
                expect(definitions[0].textContent.trim()).toBe(definition);
                expect(titles[0].closest('code') !== null).toBe(insideCode);
            }

            const excludedMarkdown = readFileSync(join(outputPath, 'excluded.md'), 'utf8');
            expect(excludedMarkdown.match(/^\[\*[^\]]+\]:/gm)).toEqual(['[*api]:']);
            expect(excludedMarkdown).not.toContain('Excluded definition must not leak.');

            const excludedHtml = readHtml('excluded');
            expect(excludedHtml.querySelectorAll('dfn')).toHaveLength(1);
            expect(excludedHtml.querySelector('dfn')?.textContent.trim()).toBe(
                'Definition owned by the root page.',
            );
            expect(excludedHtml.querySelector('.yfm-term_title')?.getAttribute('term-key')).toBe(
                ':api',
            );

            const conflictsHtml = readHtml('conflicts');
            const definitions = conflictsHtml.querySelectorAll('dfn');
            expect(definitions).toHaveLength(2);

            for (const {label, definition, insideCode} of [
                {
                    label: 'First API',
                    definition: 'Definition from the first include.',
                    insideCode: false,
                },
                {
                    label: 'Second API',
                    definition: 'Definition from the second include.',
                    insideCode: false,
                },
                {
                    label: 'Second code API',
                    definition: 'Definition from the second include.',
                    insideCode: true,
                },
            ]) {
                const title = conflictsHtml
                    .querySelectorAll('.yfm-term_title')
                    .find((candidate) => candidate.textContent === label);
                const matchingDefinition = definitions.find(
                    (candidate) => candidate.textContent.trim() === definition,
                );

                expect(title).toBeDefined();
                expect(matchingDefinition).toBeDefined();
                expect(matchingDefinition?.getAttribute('id')).toBe(
                    `${title?.getAttribute('term-key')}_element`,
                );
                expect(title?.closest('code') !== null).toBe(insideCode);
            }

            const chainedHtml = readHtml('chained-conflict');
            const chainedDefinitions = chainedHtml.querySelectorAll('dfn');
            expect(chainedDefinitions).toHaveLength(4);

            const apiKeys: string[] = [];
            const sdkKeys: string[] = [];

            for (const {label, sdkDefinition} of [
                {label: 'Root API', sdkDefinition: 'Parent SDK.'},
                {label: 'Child API', sdkDefinition: 'Dependency SDK.'},
            ]) {
                const apiTitle = chainedHtml
                    .querySelectorAll('.yfm-term_title')
                    .find((candidate) => candidate.textContent === label);
                expect(apiTitle).toBeDefined();

                const apiKey = apiTitle?.getAttribute('term-key') ?? '';
                expect(apiKey).not.toBe('');
                const apiDefinition = chainedDefinitions.find(
                    (candidate) => candidate.getAttribute('id') === `${apiKey}_element`,
                );
                expect(apiDefinition).toBeDefined();

                const sdkTitle = apiDefinition?.querySelector('.yfm-term_title');
                expect(sdkTitle?.textContent).toBe('SDK');
                const sdkKey = sdkTitle?.getAttribute('term-key') ?? '';
                expect(sdkKey).not.toBe('');
                const sdkPopup = chainedDefinitions.find(
                    (candidate) => candidate.getAttribute('id') === `${sdkKey}_element`,
                );
                expect(sdkPopup?.textContent.trim()).toBe(sdkDefinition);

                apiKeys.push(apiKey);
                sdkKeys.push(sdkKey);
            }

            expect(apiKeys[0]).toBe(':api');
            expect(sdkKeys[0]).toBe(':sdk');
            expect(apiKeys[1]).not.toBe(apiKeys[0]);
            expect(sdkKeys[1]).not.toBe(sdkKeys[0]);
        },
    );

    test.each([true, false])(
        'wrapped term labels: match unmerged rendering and preserve code literals (source maps: %s)',
        async (sourceMaps) => {
            const paths = getTestPaths('mocks/merge-includes/multiline-term-labels');
            const expectedTerms: Array<{
                page: string;
                label: string;
                definition: string;
                insideCode?: boolean;
            }> = [
                {
                    page: 'renderer-control',
                    label: 'Control API',
                    definition: 'Renderer control definition.',
                },
                {
                    page: 'renderer-control',
                    label: 'Control spaced API',
                    definition: 'Renderer control spaced definition.',
                },
                {
                    page: 'renderer-control',
                    label: 'Part 2. name',
                    definition: 'Renderer ordered continuation definition.',
                },
                {page: 'index', label: 'Wrapped API', definition: 'Definition of the wrapped API.'},
                {
                    page: 'index',
                    label: 'Wrapped spaced API',
                    definition: 'Definition of the wrapped spaced key.',
                },
                {
                    page: 'index',
                    label: 'Part 2. name',
                    definition: 'Hoisted ordered continuation definition.',
                },
                {page: 'conflicts', label: 'Root API', definition: 'Root API definition.'},
                {page: 'conflicts', label: 'Child API', definition: 'Child API definition.'},
                {
                    page: 'conflicts',
                    label: 'Root spaced API',
                    definition: 'Root spaced definition.',
                },
                {
                    page: 'conflicts',
                    label: 'Child spaced API',
                    definition: 'Child spaced definition.',
                },
                {
                    page: 'conflicts',
                    label: 'Root ordered',
                    definition: 'Root ordered definition.',
                },
                {
                    page: 'conflicts',
                    label: 'Part 2. name',
                    definition: 'Child ordered definition.',
                },
                {page: 'code-literals', label: 'Root API', definition: 'Root code definition.'},
                {page: 'code-literals', label: 'Child API', definition: 'Child code definition.'},
                {
                    page: 'code-literals',
                    label: 'Code API',
                    definition: 'Child code definition.',
                    insideCode: true,
                },
                {page: 'key-newline', label: 'Root key', definition: 'Root key definition.'},
                {page: 'key-newline', label: 'Child key', definition: 'Child key definition.'},
            ];

            for (const merge of [false, true]) {
                const outputPath = `${paths.outputPath}-${sourceMaps ? 'source-maps' : 'plain'}-${merge ? 'merged' : 'baseline'}`;
                const args = [
                    merge ? '--merge-includes' : '--no-merge-includes',
                    '--multiline-term-definitions',
                    sourceMaps ? '--merge-includes-source-maps' : '--no-merge-includes-source-maps',
                ];

                await TestAdapter.testBuildPass(paths.inputPath, outputPath, {
                    md2md: true,
                    md2html: false,
                    args: args.join(' '),
                });

                const htmlReport = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
                    ...args,
                    '-f',
                    'html',
                    '--static-content',
                ]);
                expect(htmlReport.code).toBe(0);
                expect(htmlReport.errors).toEqual([]);
                expect(htmlReport.warns).toEqual([]);

                const pages = new Map(
                    ['index', 'renderer-control', 'conflicts', 'code-literals', 'key-newline'].map(
                        (page) => [
                            page,
                            parse(
                                readFileSync(join(`${outputPath}-html`, `${page}.html`), 'utf8'),
                                {
                                    blockTextElements: {script: true, style: true, noscript: true},
                                },
                            ),
                        ],
                    ),
                );

                for (const {page, label, definition, insideCode = false} of expectedTerms) {
                    // The direct page isolates renderer semantics from unmerged include
                    // scoping. Merged includes must retain and bind their hoisted definitions.
                    if (!merge && page !== 'renderer-control') {
                        continue;
                    }
                    const html = pages.get(page)!;
                    const titles = html
                        .querySelectorAll('.yfm-term_title')
                        .filter((title) => title.textContent.replace(/\s+/g, ' ').trim() === label);
                    expect(titles, `${page}: ${label} (merge: ${merge})`).toHaveLength(1);
                    const key = titles[0].getAttribute('term-key');
                    const definitions = html
                        .querySelectorAll('dfn')
                        .filter((popup) => popup.getAttribute('id') === `${key}_element`);
                    expect(definitions).toHaveLength(1);
                    expect(definitions[0].textContent.trim()).toBe(definition);
                    expect(titles[0].closest('code') !== null).toBe(insideCode);
                }

                for (const [page, definitions] of [
                    ['renderer-control', 3],
                    ['index', 3],
                    ['conflicts', 6],
                    ['code-literals', 2],
                    ['key-newline', 2],
                ] as const) {
                    if (!merge && page !== 'renderer-control') {
                        continue;
                    }
                    const html = pages.get(page)!;
                    expect(html.querySelectorAll('dfn')).toHaveLength(definitions);
                    expect(html.querySelectorAll('.yfm-term_title')).toHaveLength(
                        expectedTerms.filter((term) => term.page === page).length,
                    );
                }

                const codeHtml = pages.get('code-literals')!;
                const inlineCode = codeHtml
                    .querySelectorAll('code')
                    .find((code) => code.closest('pre') === null);
                expect(inlineCode?.textContent).toBe('[Inline API](*api)');
                const fencedCode = codeHtml.querySelector('pre code');
                expect(fencedCode?.textContent).toContain('[Fenced\nAPI](*api)');
                expect(fencedCode?.querySelectorAll('.yfm-term_title')).toHaveLength(1);
                expect(pages.get('key-newline')?.textContent.replace(/\s+/g, ' ')).toContain(
                    '[Not a term](*api key)',
                );

                if (merge) {
                    const codeMarkdown = readFileSync(join(outputPath, 'code-literals.md'), 'utf8');
                    expect(codeMarkdown).toContain('`[Inline\nAPI](*api)`');
                    expect(codeMarkdown).toContain('[Fenced\nAPI](*api)');
                    const keyMarkdown = readFileSync(join(outputPath, 'key-newline.md'), 'utf8');
                    expect(keyMarkdown).toContain('[Not a term](*api\nkey)');
                }
            }
        },
    );

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
