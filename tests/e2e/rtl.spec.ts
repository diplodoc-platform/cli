import {compareDirectories, createRunner, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true, args = '--allow-custom-resources'},
) => {
    const runner = createRunner();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await runner.runYfmDocs(inputPath, outputPath, {md2md, md2html, args});
        compareDirectories(outputPath);
    });
};

describe('Generate html document with correct lang and dir attributes. Load correct bundles.', () => {
    generateMapTestTemplate(
        'documentation with rtl and ltr langs',
        'mocks/rtl/multidirectional-languages',
        {md2html: true, md2md: false},
    );

    generateMapTestTemplate('documentation with only one rtl lang', 'mocks/rtl/rtl-language', {
        md2html: true,
        md2md: false,
    });
});
