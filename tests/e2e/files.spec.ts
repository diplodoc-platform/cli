import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Static files from _assets directory', () => {
    test('Download link should be enabled', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/files');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });
        await compareDirectories(outputPath);

        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        await compareDirectories(outputPath + '-html');
    });
});
