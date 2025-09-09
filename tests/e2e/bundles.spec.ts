import {describe, it} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Check bundles', () => {
    it('bundles list is correct', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/bundles');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await compareDirectories(outputPath, true, true);
    });
});
