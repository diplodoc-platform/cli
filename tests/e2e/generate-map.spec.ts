import {getTestPaths, compareFiles, runYfmDocs} from '../utils';

describe('Generate map for', () => {
    test('project with single language and toc include', () => {
        const testRootPath = 'mocks/generate-map/test1';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath, {md2md: false, md2html: true, args: '--add-map-file'});

        const compareResult = compareFiles(outputPath, expectedOutputPath);

        if (typeof compareResult === 'boolean') {
            expect(true).toEqual(compareResult);
        } else {
            const {expectedContent, outputContent} = compareResult;

            expect(expectedContent).toEqual(outputContent);
        }
    });

    test('project with multiple language', () => {
        const testRootPath = 'mocks/generate-map/test2';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        runYfmDocs(inputPath, outputPath, {md2md: false, md2html: true, args: '--add-map-file'});

        const compareResult = compareFiles(outputPath, expectedOutputPath);

        if (typeof compareResult === 'boolean') {
            expect(true).toEqual(compareResult);
        } else {
            const {expectedContent, outputContent} = compareResult;

            expect(expectedContent).toEqual(outputContent);
        }
    });
});
