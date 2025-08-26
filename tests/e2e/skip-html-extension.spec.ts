import {describe, it} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Skip html extension', () => {
    it('transforms links correctly', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/skip-html-extension');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2 --skip-html-extension',
        });
        await compareDirectories(outputPath);
    });
});
