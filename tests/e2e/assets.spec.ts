import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Assets', () => {
    it('Assets', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/assets');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });
});
