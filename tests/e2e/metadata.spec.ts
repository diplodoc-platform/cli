import {describe, test} from 'vitest';
import {compareDirectories, getTestPaths} from '../fixtures';
import {CliTestAdapter} from '../fixtures/cliAdapter';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true},
) => {
    const cliTestAdapter = new CliTestAdapter();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await cliTestAdapter.testBuildPass(inputPath, outputPath, {md2md, md2html});
        compareDirectories(outputPath);
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
