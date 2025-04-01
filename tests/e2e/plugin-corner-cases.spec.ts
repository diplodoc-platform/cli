import {compareDirectories, createRunner, getTestPaths} from '../fixtures';

describe('plugin corner cases:', () => {
    const runner = createRunner();

    it('images in deflists — integrity check', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/plugin-corner-cases/images-in-deflists',
        );

        await runner.runYfmDocs(inputPath, outputPath, {md2md: true, md2html: false});
        compareDirectories(outputPath);
    });
});
