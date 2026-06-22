import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Autotitles', () => {
    test('{#T} in a link inside a subdirectory resolves to the target page title (md2html)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/autotitles');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        const html = readFileSync(resolve(outputPath, 'docs/index.html'), 'utf8');

        expect(html).not.toContain('{#T}');
        expect(html).toContain('Target Title');
    });

    test('{#T} in a link inside a subdirectory resolves to the target page title (md2md)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/autotitles');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2',
        });

        const md = readFileSync(resolve(outputPath, 'docs/index.md'), 'utf8');

        expect(md).not.toContain('{#T}');
        expect(md).toContain('Target Title');
    });
});
