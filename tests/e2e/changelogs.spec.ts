import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Changelogs', () => {
    it('should process changelogs with images correctly', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/changelogs');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--changelogs',
        });
        await compareDirectories(outputPath);
    });

    it('should handle changelogs without enabling the feature', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/changelogs');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--no-changelogs',
        });
        await compareDirectories(outputPath);
    });
});
