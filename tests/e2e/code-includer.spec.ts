import {mkdir, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, describe, expect, test} from 'vitest';

import {TestAdapter, cleanupDirectory, getTestPaths} from '../fixtures';

describe('code directive', () => {
    const success = getTestPaths('mocks/code-includer/success');
    const failure = getTestPaths('mocks/code-includer/failure');
    const temporaryDirectories: string[] = [];

    afterAll(async () => {
        await Promise.all([
            cleanupDirectory(success.outputPath),
            cleanupDirectory(`${success.outputPath}-html`),
            cleanupDirectory(failure.outputPath),
            ...temporaryDirectories.map(cleanupDirectory),
        ]);
    });

    async function temporaryProject(markdown: string, files: Record<string, string>) {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'code-includer-')));
        temporaryDirectories.push(root);
        const input = join(root, 'input');
        await mkdir(input);
        const sources = {
            ...files,
            'toc.yaml': 'href: index.md\n',
            'index.md': markdown,
            '.yfm': 'vcs: false\nmtimes: false\nsearch: false\nllms: false\nextensions: []\n',
        };
        await Promise.all(
            Object.entries(sources).map(async ([path, content]) => {
                const target = join(input, path);
                await mkdir(dirname(target), {recursive: true});
                await writeFile(target, content);
            }),
        );
        return {input, root};
    }

    function legacyProject(directive = `{% code './example.ts' lines="BEGIN-END" %}`) {
        return temporaryProject(`# Legacy code\n\n${directive}\n`, {
            'example.ts': 'before();\n// BEGIN\nlegacy();\n// END\nafter();\n',
        });
    }

    test('includes relative and input-root files in md2md and HTML', async () => {
        await TestAdapter.testBuildPass(success.inputPath, success.outputPath, {
            md2md: true,
            md2html: true,
            args: '--id-generator deterministic',
        });

        const markdown = await readFile(join(success.outputPath, 'nested/page.md'), 'utf8');
        const html = await readFile(join(`${success.outputPath}-html`, 'nested/page.html'), 'utf8');

        expect(markdown).toContain(
            ['  ```typescript', '  const local = 1;', '  console.log(local);', '  ```'].join('\n'),
        );
        expect(markdown).toContain(['```', 'root();', '```'].join('\n'));
        expect(markdown).toContain(
            ['```text', '    indentation stays', '      nested indentation stays', '```'].join(
                '\n',
            ),
        );
        expect(html).toContain('local = ');
        expect(html).toContain('console');
        expect(html).toContain('root();');
        expect(markdown).toContain(['```typescript', 'outer();', '  nested();', '```'].join('\n'));
        expect(markdown).toContain(['```typescript', 'nested();', '```'].join('\n'));
        expect(markdown).not.toContain('#region');
        expect(markdown).not.toContain('[START');
        expect(html).toContain('nested');
        expect(html).not.toContain('#endregion');
    });

    test('fails safely for missing and out-of-input files', async () => {
        await cleanupDirectory(failure.outputPath);

        const report = await TestAdapter.build.run(failure.inputPath, failure.outputPath, [
            '-f',
            'md',
        ]);
        const markdown = await readFile(join(failure.outputPath, 'index.md'), 'utf8');

        expect(report.code).toBeGreaterThan(0);
        expect(report.errors).toHaveLength(2);
        expect(markdown).toContain('<!-- code directive failed -->');
        expect(markdown).not.toContain('{% code');
    });

    test.each(['md', 'html'])(
        'keeps legacy selectors nonfatal with --strict (%s)',
        async (format) => {
            const {input, root} = await legacyProject();
            const outputs: string[] = [];
            for (const strict of [false, true]) {
                const output = join(root, strict ? 'strict' : 'normal');
                const args = [
                    '--input',
                    input,
                    '--output',
                    output,
                    '-f',
                    format,
                    '--no-lint',
                    '--id-generator',
                    'deterministic',
                ];
                if (strict) {
                    args.push('--strict');
                }
                const report = await TestAdapter.runner.runRaw(args);
                expect(report.code).toBe(0);
                expect(report.warns).toEqual([]);
                expect(report.errors).toEqual([]);
                expect(report.stdout).toContain(
                    'Code directive: attribute "lines" is deprecated; use a named region in "path#region" instead.',
                );
                outputs.push(await readFile(join(output, `index.${format}`), 'utf8'));
            }
            expect(outputs[0]).toBe(outputs[1]);
            expect(outputs[0]).toContain('legacy');
            if (format === 'md') {
                expect(outputs[0]).toContain('```\nlegacy();\n```');
                expect(outputs[0]).not.toContain('before();');
                expect(outputs[0]).not.toContain('after();');
            }
        },
    );

    test.each([
        [
            `{% code './example.ts' lines="BEGIN-END" unsupported="value" %}`,
            'unexpected attribute "unsupported" was ignored',
        ],
        [`{% code './example.ts' lines="MISSING-END" %}`, 'start marker "MISSING" was not found'],
    ])('still fails on ordinary warnings with --strict: %s', async (directive, warning) => {
        const {input, root} = await legacyProject(directive);
        const report = await TestAdapter.runner.runRaw([
            '--input',
            input,
            '--output',
            join(root, 'output'),
            '-f',
            'md',
            '--no-lint',
            '--strict',
        ]);
        expect(report.code).toBeGreaterThan(0);
        expect(report.warns.some((message) => message.includes(warning))).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.stdout).toContain('attribute "lines" is deprecated');
    });

    test('includes CSS and HTML regions with bare closing markers in block comments', async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'code-region-comments-')));
        temporaryDirectories.push(root);
        const input = join(root, 'input');
        const output = join(root, 'output');
        await mkdir(input);
        await Promise.all([
            writeFile(join(input, 'toc.yaml'), 'href: index.md\n'),
            writeFile(
                join(input, 'index.md'),
                [
                    '# Block-comment regions',
                    `{% code './example.css#style' lang="css" %}`,
                    `{% code './example.html#markup' lang="html" %}`,
                ].join('\n\n'),
            ),
            writeFile(
                join(input, 'example.css'),
                '/* #region style */\nbody { color: red; }\n/* #endregion */',
            ),
            writeFile(
                join(input, 'example.html'),
                '<!-- #region markup -->\n<strong>region</strong>\n<!-- #endregion -->',
            ),
        ]);
        await TestAdapter.testBuildPass(input, output, {
            md2md: true,
            md2html: true,
            args: '--id-generator deterministic',
        });
        const markdown = await readFile(join(output, 'index.md'), 'utf8');
        const html = await readFile(join(`${output}-html`, 'index.html'), 'utf8');
        expect(markdown).toContain(['```css', 'body { color: red; }', '```'].join('\n'));
        expect(markdown).toContain(['```html', '<strong>region</strong>', '```'].join('\n'));
        expect(markdown).not.toContain('#region');
        expect(html).not.toContain('#endregion');
    });

    test.each(['md', 'html'])(
        'preserves literal hashes, region selectors and marker-like text (%s)',
        async (format) => {
            const {input, root} = await temporaryProject(
                [
                    '# Hash paths and marker boundaries',
                    `{% code './C#/Program.cs' %}`,
                    `{% code './C#/Program.cs' lines='BEGIN-END' %}`,
                    `{% code './C#/Program#v2.cs#auth' %}`,
                    `{% code './literal.ts#auth' %}`,
                    `{% code './file#with spaces.ts' %}`,
                    `{% code './markers.ts#outer' %}`,
                    `{% code './markers.ts#inner' %}`,
                ].join('\n\n'),
                {
                    'C#/Program.cs': '// BEGIN\ncsharp();\n// END',
                    'C#/Program#v2.cs': '// #region auth\ncsharpRegion();\n// #endregion',
                    'literal.ts#auth': 'literalWins();',
                    'literal.ts': '// #region auth\nregionLoses();\n// #endregion',
                    'file#with spaces.ts': 'spaceHash();',
                    'markers.ts': [
                        '// #region-banner',
                        '// #region outer',
                        'first();',
                        '// #endregion-old',
                        'second();',
                        '// [START inner]',
                        'inner();',
                        '// [END inner]',
                        'third();',
                        '// #endregion outer',
                    ].join('\n'),
                },
            );
            const output = join(root, 'output');
            const report = await TestAdapter.runner.runRaw([
                '--input',
                input,
                '--output',
                output,
                '-f',
                format,
                '--strict',
                '--no-lint',
                '--id-generator',
                'deterministic',
            ]);
            expect(report.code).toBe(0);
            expect(report.warns).toEqual([]);
            expect(report.errors).toEqual([]);
            const content = await readFile(join(output, `index.${format}`), 'utf8');
            for (const included of [
                'csharp',
                'csharpRegion',
                'literalWins',
                'spaceHash',
                'first',
                'second',
                'inner',
                'third',
            ]) {
                expect(content).toContain(included);
            }
            expect(content).not.toContain('regionLoses');
            if (format === 'md') {
                expect(content).toContain(
                    [
                        '```',
                        'first();',
                        '// #endregion-old',
                        'second();',
                        'inner();',
                        'third();',
                        '```',
                    ].join('\n'),
                );
                expect(content).toContain('```\ninner();\n```');
            }
        },
    );

    test.each(['md', 'html'])(
        'selects opaque dot segments and regions from long filenames (%s)',
        async (format) => {
            const longName = 'a'.repeat(245) + '.ts';
            const {input, root} = await temporaryProject(
                [
                    '# Opaque region names',
                    `{% code './example.ts#section/../other.ts' %}`,
                    `{% code './${longName}#authentication' %}`,
                ].join('\n\n'),
                {
                    'example.ts': '// #region section/../other.ts\nselected();\n// #endregion',
                    'other.ts': 'unrelated();',
                    [longName]: '// #region authentication\nlongSelected();\n// #endregion',
                },
            );
            const output = join(root, 'output');
            const report = await TestAdapter.runner.runRaw([
                '--input',
                input,
                '--output',
                output,
                '-f',
                format,
                '--strict',
                '--no-lint',
            ]);
            expect(report.code).toBe(0);
            expect(report.errors).toEqual([]);
            expect(report.warns).toEqual([]);
            const content = await readFile(join(output, `index.${format}`), 'utf8');
            expect(content).toContain('selected');
            expect(content).toContain('longSelected');
            expect(content).not.toContain('unrelated');
        },
    );

    test('fails the build for missing, empty, duplicated, or malformed regions', async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'code-regions-')));
        temporaryDirectories.push(root);
        const input = join(root, 'input');
        const output = join(root, 'output');
        const sources = {
            missing: 'private();',
            empty: '// #region r\n \n// #endregion',
            unclosed: '// #region r\nprivate();\n// #endregion-old\nstillUnclosed();',
            duplicated:
                '// #region r\nprivate();\n// #endregion\n// [START r]\nprivate();\n// [END r]',
            crossed:
                '// #region r\n// #region inner\nprivate();\n// #endregion r\n// #endregion inner',
            unmatched: '// [END r]',
        };
        await mkdir(input);
        await Promise.all([
            writeFile(join(input, 'toc.yaml'), 'href: index.md\n'),
            writeFile(
                join(input, 'index.md'),
                '# Invalid regions\n\n' +
                    Object.keys(sources)
                        .map((name) => `{% code './${name}.ts#r' %}`)
                        .join('\n\n'),
            ),
            ...Object.entries(sources).map(([name, content]) =>
                writeFile(join(input, `${name}.ts`), content),
            ),
        ]);
        const report = await TestAdapter.build.run(input, output, ['-f', 'md']);
        const markdown = await readFile(join(output, 'index.md'), 'utf8');
        expect(report.code).toBeGreaterThan(0);
        expect(report.errors).toHaveLength(Object.keys(sources).length);
        for (const name of Object.keys(sources)) {
            expect(
                report.errors.some(
                    (message) =>
                        message.includes('index.md: Code directive:') &&
                        message.includes(`./${name}.ts#r`),
                ),
            ).toBe(true);
        }
        expect(markdown.match(/<!-- code directive failed -->/g)).toHaveLength(
            Object.keys(sources).length,
        );
        expect(markdown).not.toContain('private();');
        expect(markdown).not.toContain('{% code');
    });
});
