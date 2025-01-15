import {compareDirectories, getTestPaths, runYfmDocs} from '../utils';

describe('plugin corner cases:', () => {
    it('images in deflists — integrity check', () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/plugin-corner-cases/images-in-deflists',
        );

        runYfmDocs(inputPath, outputPath, {md2md: true, md2html: false});
        compareDirectories(outputPath);
    });
});
