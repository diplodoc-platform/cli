import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Code sources', () => {
    it('resolves include-code against an external source', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/code-sources');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });

        const content = await readFile(join(outputPath, 'index.md'), 'utf8');

        // Region body only: markers are stripped and the common indent removed.
        expect(content).toContain(
            [
                '```go',
                'db, err := sdk.Open(ctx, dsn)',
                'if err != nil {',
                '\treturn err',
                '}',
                '```',
            ].join('\n'),
        );

        // Permalink is pinned to the configured ref, includes the source `path`
        // prefix, and points at the resolved lines of the region.
        expect(content).toContain(
            '[Open a connection](https://github.com/example/sdk/blob/v1.2.3/examples/connect.go#L7-L10)',
        );

        // `link=false` suppresses the source link for the whole-file include.
        expect(content).toContain('package main');

        // A directive shown as a code example is left verbatim, so a page can
        // document the syntax without resolving it.
        expect(content).toContain('```\n{% include-code [](go-sdk:connect.go#connect) %}\n```');
    });

    it('fails the build and emits inert placeholders for unresolvable directives', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/code-sources-errors');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);

        expect(report.code).not.toBe(0);
        expect(report.errors.join('\n')).toContain('Unknown code source');
        expect(report.errors.join('\n')).toContain("region 'missing' not found");

        const content = await readFile(join(outputPath, 'index.md'), 'utf8');

        // A failed directive must never survive as its own text: `[](source:path)`
        // is valid link syntax, so asset resolution would try to open it as a
        // local file and bury the real error under unrelated ENOENTs.
        expect(content).toContain("<!-- include-code failed: unknown source 'nope' -->");
        expect(content).toContain('<!-- include-code failed: go-sdk:connect.go -->');
        expect(content).not.toContain('{% include-code');
    });
});
