import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {afterAll, describe, expect, test} from 'vitest';

import {TestAdapter, cleanupDirectory, getTestPaths} from '../fixtures';

describe('code directive', () => {
    const success = getTestPaths('mocks/code-includer/success');
    const failure = getTestPaths('mocks/code-includer/failure');

    afterAll(async () => {
        await Promise.all([
            cleanupDirectory(success.outputPath),
            cleanupDirectory(`${success.outputPath}-html`),
            cleanupDirectory(failure.outputPath),
        ]);
    });

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
        expect(markdown).toContain(`{% code "./data.json" lang="json" jsonpath="$.value" %}`);
        expect(html).toContain('local = ');
        expect(html).toContain('console');
        expect(html).toContain('root();');
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
});
