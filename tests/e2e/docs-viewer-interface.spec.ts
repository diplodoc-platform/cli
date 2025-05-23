import {describe, test} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const testTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true, args = ''},
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {md2md, md2html, args});
        await compareDirectories(outputPath);
    });
};

describe('Yfm docs-viewer: interface props', () => {
    testTemplate(
        'Interface props set - toc, search, feedback, __DATA__ object should contain props in viewerInterface prop',
        'mocks/docs-viewer-interface',
        {md2md: true, md2html: false},
    );
});