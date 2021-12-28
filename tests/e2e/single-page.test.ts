import {compareDirectories, runYfmDocs, getTestPaths} from '../utils';

describe('Single page', () => {
    test('Test1', () => {
        const testRootPath = './tests/mocks/single-page/test1';
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

    test('Test2', () => {
        const testRootPath = './tests/mocks/single-page/test2';
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

    test('Test3', () => {
        const testRootPath = './tests/mocks/single-page/test3';
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
