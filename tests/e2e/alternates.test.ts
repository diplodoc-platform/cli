import {describe, it} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Alternates', () => {
    it('skip-html-extension', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/alternates');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2 --skip-html-extension',
        });

        await compareDirectories(outputPath);
    });

    it('internal', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/alternates');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '-j2',
        });
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
            args: '-j2',
        });

        await compareDirectories(outputPath);
        await compareDirectories(outputPath + '-html');
    });
});
