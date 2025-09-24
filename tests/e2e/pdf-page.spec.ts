import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Pdf page mode', () => {
    it('transforms links correctly', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/pdf-page');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });
});
