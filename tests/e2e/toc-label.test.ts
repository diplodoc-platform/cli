import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Toc label', () => {
    it('should pass TocLabel object through to toc output', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/toc-label');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });
        await compareDirectories(outputPath);
    });
});
