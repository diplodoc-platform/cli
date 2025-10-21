import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Skip html extension', () => {
    it('Neuro-expert', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/neuro-expert');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2',
        });
        await compareDirectories(outputPath);
    });
});
