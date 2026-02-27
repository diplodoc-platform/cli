import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Toc label', () => {
    it('should pass TocLabel object through to toc output', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/toc-label');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        const tocJs = readFileSync(resolve(outputPath, 'toc.js'), 'utf8');
        const tocJsonMatch = tocJs.match(/window\.__DATA__\.data\.toc\s*=\s*({.*});/);

        expect(tocJsonMatch).not.toBeNull();

        const toc = JSON.parse(tocJsonMatch![1]);

        expect(toc.label).toBeDefined();
        expect(toc.label).toEqual({
            title: 'Preview',
            description: 'This service is in preview',
            theme: 'info',
        });
    });
});
