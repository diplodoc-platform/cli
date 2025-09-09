import {describe, test} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestSinglePageTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true, args = '--single-page'},
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md, md2html, args});
        await compareDirectories(outputPath);
    });
};

describe('Single page mode', () => {
    generateMapTestSinglePageTemplate(
        'simple md2html single page with lang dirs',
        'mocks/single-page',
        {md2md: false},
    );
});
