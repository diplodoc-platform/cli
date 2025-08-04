import {describe, test} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateFilesYamlTestTemplate = (
    testTitle: string,
    testRootPath: string
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md:true});
        await compareDirectories(outputPath);
    });
};

describe('Preprocess', () => {
    generateFilesYamlTestTemplate('HashIncludes=true,Autotitles=false', 'mocks/preprocess/test1');

    generateFilesYamlTestTemplate('HashIncludes=true,Autotitles=true', 'mocks/preprocess/test2');

    // generateFilesYamlTestTemplate('Nested toc restricted access', 'mocks/preprocess/test3');
});
