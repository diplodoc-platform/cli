import {compareDirectories, runYfmDocs, getTestPaths} from './utils';

describe('Include toc', () => {
    test('Test1', () => {
        const testRootPath = './tests/mocks/include-toc/test1';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath);

        const compareResult = compareDirectories(outputPath, expectedOutputPath);

        if (typeof compareResult === 'boolean') {
            expect(true).toEqual(compareResult);
        } else {
            const {expectedContent, outputContent} = compareResult;

            expect(expectedContent).toEqual(outputContent);
        }
    });
});
