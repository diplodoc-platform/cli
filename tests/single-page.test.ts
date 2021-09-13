import {isEqualDirectories, runYfmDocs, getTestPaths} from './utils';

describe('Single page', () => {
    test('Test1', () => {
        const testRootPath = './tests/mocks/single-page/test1';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath);

        const isEqualOutput = isEqualDirectories(outputPath, expectedOutputPath);

        expect(true).toEqual(isEqualOutput);
    });

    test('Test2', () => {
        const testRootPath = './tests/mocks/single-page/test2';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath);

        const isEqualOutput = isEqualDirectories(outputPath, expectedOutputPath);

        expect(true).toEqual(isEqualOutput);
    });

    test('Test3', () => {
        const testRootPath = './tests/mocks/single-page/test3';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath);

        const isEqualOutput = isEqualDirectories(outputPath, expectedOutputPath);

        expect(true).toEqual(isEqualOutput);
    });
});
