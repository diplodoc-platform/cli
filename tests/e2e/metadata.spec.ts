import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true},
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md, md2html});
        await compareDirectories(outputPath);
    });
};

describe('Allow load custom resources', () => {
    generateMapTestTemplate('md2md with metadata', 'mocks/metadata/md2md-with-metadata', {
        md2html: false,
    });

    generateMapTestTemplate('md2html with metadata', 'mocks/metadata/md2html-with-metadata', {
        md2md: false,
    });
});
