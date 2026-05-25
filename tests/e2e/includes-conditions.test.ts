import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Includes with conditions', () => {
    test('Consecutive includes with false condition in the middle', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/includes-conditions');

        // Test md2md transformation
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });
        await compareDirectories(outputPath);

        // Test md2html transformation
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        await compareDirectories(outputPath + '-html');
    });
});
