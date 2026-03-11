import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Toc label', () => {
    it('should pass TocLabel object through to toc output', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/toc-label');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2',
        });
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        await compareDirectories(outputPath);
        await compareDirectories(outputPath + '-html');
    });
});
