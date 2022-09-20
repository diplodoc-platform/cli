import {compareDirectories, runYfmDocs, getTestPaths} from '../utils';

describe('Include toc', () => {
    test('Toc is included in link mode', () => {
        const testRootPath = 'mocks/include-toc/test1';
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

    test('Toc is included inline, not as a new section', () => {
        const testRootPath = 'mocks/include-toc/test2';
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

    test('Nested toc inclusions with mixed including modes', () => {
        const testRootPath = 'mocks/include-toc/test3';
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

    test('Toc with expressions', () => {
        const testRootPath = 'mocks/include-toc/test4';
        const {inputPath, outputPath, expectedOutputPath} = getTestPaths(testRootPath);

        const vars = {
            type: 'a',
            a: 'A',
            b: 'B',
        };

        runYfmDocs(inputPath, outputPath, {
            args: `--vars="${JSON.stringify(vars).replace(/(")/g, '\\$1')}"`,
        });

        const compareResult = compareDirectories(outputPath, expectedOutputPath);

        if (typeof compareResult === 'boolean') {
            expect(true).toEqual(compareResult);
        } else {
            const {expectedContent, outputContent} = compareResult;

            expect(expectedContent).toEqual(outputContent);
        }
    });
});
