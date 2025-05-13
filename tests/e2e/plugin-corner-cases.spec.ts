import {describe, it} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('plugin corner cases:', () => {
    it('images in deflists — integrity check', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/plugin-corner-cases/images-in-deflists',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md: true, md2html: false});
        await compareDirectories(outputPath);
    });
});
