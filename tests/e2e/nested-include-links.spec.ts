import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Nested include links', () => {
    test('Links in nested includes should resolve relative to the include file, not the entry file', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/nested-include-links');

        // Build directly to HTML
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        const htmlPath = resolve(outputPath, 'sub/deep/entry.html');
        const html = readFileSync(htmlPath, 'utf8');

        // The link from other/page.md is [link to target](../target.md)
        // It should resolve relative to other/page.md → target.md → target.html
        // NOT relative to the entry file sub/deep/entry.md → sub/deep/target.html
        expect(html).toContain('target.html');
        expect(html).not.toContain('sub/deep/target.html');
    });
});
