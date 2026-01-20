import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Conditions', () => {
    it('Conditions', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/conditions');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });
});
