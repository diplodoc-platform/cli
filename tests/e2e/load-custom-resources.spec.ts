import {describe, test} from 'vitest';
import {compareDirectories, getTestPaths} from '../fixtures';
import {CliTestAdapter} from '../fixtures/cliAdapter';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true, args = '--allow-custom-resources'},
) => {
    const cliTestAdapter = new CliTestAdapter();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await cliTestAdapter.testPass(inputPath, outputPath, {md2md, md2html, args});
        compareDirectories(outputPath);
    });
};

describe('Allow load custom resources', () => {
    generateMapTestTemplate(
        'md2md with custom resources',
        'mocks/load-custom-resources/md2md-with-resources',
        {md2html: false},
    );

    generateMapTestTemplate(
        'md2html with custom resources',
        'mocks/load-custom-resources/md2html-with-resources',
        {md2md: false},
    );

    generateMapTestTemplate(
        'md2html single page with custom resources',
        'mocks/load-custom-resources/single-page-with-resources',
        {md2md: false, args: '--allow-custom-resources --single-page'},
    );
});
