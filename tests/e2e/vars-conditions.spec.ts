import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Vars and conditions', () => {
    it('Vars and conditions', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-conditions');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });
});
