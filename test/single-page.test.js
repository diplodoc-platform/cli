const {isEqualDirectories, runYfmDocs, getTestPaths} = require('./utils');

describe('Single page', () => {
    test('Test1', () => {
        const testRootPath = './test/mocks/single-page/test1';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths({testRootPath});

        runYfmDocs({inputPath, outputPath});

        const isEqualOutput = isEqualDirectories({outputPath, expectedOutputPath});

        expect(true).toEqual(isEqualOutput);
    });
});
