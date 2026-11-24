import type {LoaderContext} from '~/core/markdown/loader';

import {describe, expect, it, vi} from 'vitest';

import {createCollect} from './collect';

function context(files: Record<string, string> = {}) {
    return {
        path: 'guide/page.md' as NormalizedPath,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
        api: {
            codeSources: {set: vi.fn()},
        },
        readFile: vi.fn(async (path: string) => {
            if (path in files) {
                return files[path];
            }
            const error = new Error('not found') as Error & {code: string};
            error.code = 'ENOENT';
            throw error;
        }),
    } as unknown as LoaderContext;
}

async function run(source: string, testContext: LoaderContext) {
    return createCollect().call(testContext, source, {}) as Promise<string>;
}

describe('code includer collect', () => {
    it('resolves relative and input-root paths in multiple directives', async () => {
        const testContext = context({
            'guide/examples/local.ts': '    local();\n',
            'examples/root.ts': 'root();\n',
        });

        const result = await run(
            [`{% code './examples/local.ts' lang="ts" %}`, `{% code '/examples/root.ts' %}`].join(
                '\n',
            ),
            testContext,
        );

        expect(result).toBe(['```ts', 'local();', '```', '```', 'root();', '```'].join('\n'));
        expect(testContext.readFile).toHaveBeenCalledWith('guide/examples/local.ts');
        expect(testContext.readFile).toHaveBeenCalledWith('examples/root.ts');
        expect(testContext.api.codeSources.set).toHaveBeenCalledWith([
            'guide/examples/local.ts',
            'examples/root.ts',
        ]);
    });

    it('preserves indentation when requested and nests the fence in a list', async () => {
        const testContext = context({'guide/example.ts': '    first();\n      second();'});

        const result = await run(`- item\n\n  {% code './example.ts' keep-indents %}`, testContext);

        expect(result).toBe(
            ['- item', '', '  ```', '      first();', '        second();', '  ```'].join('\n'),
        );
    });

    it('does not execute fenced examples or jsonpath directives', async () => {
        const testContext = context();
        const source = [
            '````md',
            `{% code './example.ts' %}`,
            '````',
            `{% code './data.json' lang="json" jsonpath="$.value" %}`,
        ].join('\n');

        expect(await run(source, testContext)).toBe(source);
        expect(testContext.readFile).not.toHaveBeenCalled();
        expect(testContext.logger.warn).not.toHaveBeenCalled();
        expect(testContext.logger.error).not.toHaveBeenCalled();
        expect(testContext.api.codeSources.set).toHaveBeenCalledWith([]);
    });

    it('does not execute directives in inline code spans', async () => {
        const testContext = context({'guide/example.ts': 'kept();\n'});
        const examples = [
            "Use `write {% code './missing.ts' %}` to show the syntax.",
            "Or ``write {% code './missing.ts' %}`` with double backticks.",
        ].join('\n');
        const source = `${examples}\n{% code './example.ts' %}`;

        expect(await run(source, testContext)).toBe(`${examples}\n\`\`\`\nkept();\n\`\`\``);
        expect(testContext.readFile).toHaveBeenCalledOnce();
        expect(testContext.api.codeSources.set).toHaveBeenCalledWith(['guide/example.ts']);
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('does not execute directives inside an HTML comment', async () => {
        const testContext = context({'guide/example.ts': 'kept();\n'});
        const source = `<!-- {% code './example.ts' %} -->`;

        expect(await run(source, testContext)).toBe(source);
        expect(testContext.readFile).not.toHaveBeenCalled();
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('skips extended HTML comments and processes the following directive', async () => {
        const testContext = context({'guide/example.ts': 'kept();\n'});
        const commented = `<!--- {% code './example.ts' %} --->`;
        const result = await run(`${commented}\n{% code './example.ts' %}`, testContext);

        expect(result).toBe(`${commented}\n\`\`\`\nkept();\n\`\`\``);
        expect(testContext.readFile).toHaveBeenCalledOnce();
    });

    it('ignores fence openers inside comments when finding real directives', async () => {
        const testContext = context({'guide/example.ts': 'kept();\n'});
        const source = [
            '<!--',
            '```md',
            '-->',
            "{% code './example.ts' %}",
            '```md',
            'fenced example',
            '```',
        ].join('\n');

        expect(await run(source, testContext)).toBe(
            [
                '<!--',
                '```md',
                '-->',
                '```',
                'kept();',
                '```',
                '```md',
                'fenced example',
                '```',
            ].join('\n'),
        );
        expect(testContext.readFile).toHaveBeenCalledOnce();
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('replaces missing and out-of-input sources with a safe placeholder', async () => {
        const testContext = context();

        const result = await run(
            [`{% code './missing.ts' %}`, `{% code '../../secret.ts' %}`].join('\n'),
            testContext,
        );

        expect(result).toBe(
            ['<!-- code directive failed -->', '<!-- code directive failed -->'].join('\n'),
        );
        expect(testContext.logger.error).toHaveBeenCalledTimes(2);
        expect(result).not.toContain('missing.ts');
        expect(result).not.toContain('secret.ts');
        expect(testContext.api.codeSources.set).toHaveBeenCalledWith(['guide/missing.ts']);
    });

    it('treats numeric-looking ranges as markers without failing the build', async () => {
        const testContext = context({'guide/example.ts': 'one\ntwo'});

        const result = await run(`{% code './example.ts' lines="2-9" %}`, testContext);

        expect(result).toBe('```\none\ntwo\n```');
        expect(testContext.logger.info).toHaveBeenCalledWith(
            expect.stringContaining('attribute "lines" is deprecated'),
        );
        expect(testContext.logger.warn).toHaveBeenCalledTimes(2);
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('reports legacy usage as information and preserves other directive warnings', async () => {
        const testContext = context({'guide/example.ts': '// BEGIN\nlegacy();\n// END'});

        const result = await run(
            `{% code './example.ts' lines="BEGIN-END" unsupported="value" %}`,
            testContext,
        );

        expect(result).toBe('```\nlegacy();\n```');
        expect(testContext.logger.info).toHaveBeenCalledWith(
            'guide/page.md: Code directive: attribute "lines" is deprecated; use a named region in "path#region" instead.',
        );
        expect(testContext.logger.warn).toHaveBeenCalledWith(
            'guide/page.md: Code directive: unexpected attribute "unsupported" was ignored.',
        );
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('selects nested regions and tracks literal candidates and the source file', async () => {
        const testContext = context({
            'guide/example.ts': [
                'notIncluded();',
                '// #region outer',
                '  first();',
                '// [START auth-v2]',
                '    connect();',
                '// [END auth-v2]',
                '  last();',
                '// #endregion outer',
            ].join('\n'),
        });
        const result = await run(
            [
                `{% code './example.ts#outer' lang="ts showLineNumbers wrap" %}`,
                `{% code './example.ts#auth-v2' keep-indents %}`,
            ].join('\n'),
            testContext,
        );

        expect(result).toBe(
            [
                '```ts showLineNumbers wrap',
                'first();',
                '  connect();',
                'last();',
                '```',
                '```',
                '    connect();',
                '```',
            ].join('\n'),
        );
        expect(testContext.readFile).toHaveBeenCalledTimes(3);
        expect(testContext.readFile).toHaveBeenCalledWith('guide/example.ts');
        expect(testContext.api.codeSources.set).toHaveBeenCalledWith([
            'guide/example.ts#outer',
            'guide/example.ts',
            'guide/example.ts#auth-v2',
        ]);
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it('reports the page, source, and region instead of including fallback content', async () => {
        const testContext = context({
            'guide/example.ts': '// #region known\nsecret();\n// #endregion',
        });
        expect(await run(`{% code './example.ts#missing' %}`, testContext)).toBe(
            '<!-- code directive failed -->',
        );
        expect(testContext.logger.error).toHaveBeenCalledWith(
            expect.stringContaining(
                'guide/page.md: Code directive: region "missing" was not found while including "./example.ts#missing"',
            ),
        );
    });

    it('keeps malformed region markers inert in legacy and whole-file includes', async () => {
        const testContext = context({'guide/example.ts': '// #region unclosed\nvalue();'});
        expect(await run(`{% code './example.ts' %}`, testContext)).toContain(
            '// #region unclosed',
        );
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });

    it.each([
        './C#/Program.cs',
        './Program#old.cs',
        './file#with spaces.ts',
        './file#',
        './file#.',
        './file#..',
        './file##.ts',
    ])('preserves a complete literal file path: %s', async (path) => {
        const target = `guide/${path.slice(2)}`;
        const loader = context({[target]: 'literal();'});
        expect(await run(`{% code '${path}' %}`, loader)).toBe('```\nliteral();\n```');
        expect(loader.readFile).toHaveBeenCalledExactlyOnceWith(target);
        expect(loader.logger.error).not.toHaveBeenCalled();
        expect(loader.api.codeSources.set).toHaveBeenCalledWith([target]);
    });

    it('prefers an existing complete path over a region selector', async () => {
        const loader = context({
            'guide/example.ts#auth': 'literal();',
            'guide/example.ts': '// #region auth\nregion();\n// #endregion',
        });
        expect(await run(`{% code './example.ts#auth' %}`, loader)).toBe('```\nliteral();\n```');
        expect(loader.readFile).toHaveBeenCalledExactlyOnceWith('guide/example.ts#auth');
    });

    it('supports legacy lines in files and directories with literal hashes', async () => {
        const loader = context({'guide/C#/Program#old.cs': '// BEGIN\nlegacy();\n// END'});
        expect(await run(`{% code './C#/Program#old.cs' lines='BEGIN-END' %}`, loader)).toBe(
            '```\nlegacy();\n```',
        );
        expect(loader.logger.warn).not.toHaveBeenCalled();
        expect(loader.logger.error).not.toHaveBeenCalled();
    });

    it('selects a region after the final hash in a hash-containing file path', async () => {
        const loader = context({
            'guide/C#/Program#old.cs': '// #region auth\nregion();\n// #endregion',
        });
        expect(await run(`{% code './C#/Program#old.cs#auth' %}`, loader)).toBe(
            '```\nregion();\n```',
        );
        expect(loader.readFile).toHaveBeenCalledTimes(2);
        expect(loader.readFile).toHaveBeenCalledWith('guide/C#/Program#old.cs');
        expect(loader.api.codeSources.set).toHaveBeenCalledWith([
            'guide/C#/Program#old.cs#auth',
            'guide/C#/Program#old.cs',
        ]);
    });

    it('rejects combined region and legacy selectors after ruling out a literal file', async () => {
        const loader = context({'guide/example.ts': '// #region auth\nregion();\n// #endregion'});
        expect(await run(`{% code './example.ts#auth' lines='BEGIN-END' %}`, loader)).toContain(
            'failed',
        );
        expect(loader.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('a region and attribute "lines" cannot be combined'),
        );
        expect(loader.readFile).not.toHaveBeenCalledWith('guide/example.ts');
    });

    it('checks both literal and selected paths against the input root', async () => {
        const loader = context();
        expect(await run(`{% code '../../outside.ts#r' %}`, loader)).toContain('failed');
        expect(loader.readFile).not.toHaveBeenCalled();
        expect(loader.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('escapes the input root'),
        );
    });

    it('does not probe an escaping literal path when a region name contains parent segments', async () => {
        const loader = context({
            'guide/example.ts': '// #region ../../../../r\nsafe();\n// #endregion',
        });
        expect(await run(`{% code './example.ts#../../../../r' %}`, loader)).toBe(
            '```\nsafe();\n```',
        );
        expect(loader.readFile).toHaveBeenCalledExactlyOnceWith('guide/example.ts');
    });

    it.each(['section/../other.ts', 'section/./other.ts', 'section/..', 'section/.'])(
        'keeps selector dot segments opaque: %s',
        async (region) => {
            const loader = context({
                'guide/example.ts': `// #region ${region}\nselected();\n// #endregion`,
                'guide/other.ts': 'unrelated();',
                'guide/example.ts#section/other.ts': 'unrelated();',
            });
            expect(await run(`{% code './example.ts#${region}' %}`, loader)).toBe(
                '```\nselected();\n```',
            );
            expect(loader.readFile).toHaveBeenCalledExactlyOnceWith('guide/example.ts');
            expect(loader.api.codeSources.set).toHaveBeenCalledWith(['guide/example.ts']);
        },
    );
});
