import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Local search', () => {
    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/search');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2 --search --interface-toc',
        });
        await compareDirectories(outputPath);
    });
});
