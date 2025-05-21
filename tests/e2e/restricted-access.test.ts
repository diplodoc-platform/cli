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

describe('Restricted access', () => {
    generateFilesYamlTestTemplate('Simple restricted access', 'mocks/restricted-access/test1');

    generateFilesYamlTestTemplate('Nested restricted access', 'mocks/restricted-access/test2');

    generateFilesYamlTestTemplate('Nested toc restricted access', 'mocks/restricted-access/test3');
});
