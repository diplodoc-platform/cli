import type {LoaderContext} from '~/core/markdown/loader';

import {describe, expect, it, vi} from 'vitest';

import {collect} from './collect';

function context(files: Record<string, string> = {}) {
    return {
        path: 'guide/page.md' as NormalizedPath,
        logger: {
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
    return collect.call(testContext, source, {}) as Promise<string>;
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
        expect(testContext.logger.warn).toHaveBeenCalledTimes(2);
        expect(testContext.logger.error).not.toHaveBeenCalled();
    });
});
