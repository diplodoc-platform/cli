import {describe, it} from 'vitest';
import {compareDirectories, getTestPaths} from '../fixtures';
import {CliTestAdapter} from '../fixtures/cliAdapter';

describe('plugin corner cases:', () => {
    const cliTestAdapter = new CliTestAdapter();

    it('images in deflists — integrity check', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/plugin-corner-cases/images-in-deflists',
        );

        await cliTestAdapter.testPass(inputPath, outputPath, {md2md: true, md2html: false});
        compareDirectories(outputPath);
    });
});
