import {describe, test} from 'vitest';

import {TestAdapter, cleanupDirectory, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: string,
    folder = 'pdf',
    ignoreFileContent = false,
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args,
        });

        await compareDirectories(`${outputPath}/${folder}`, ignoreFileContent);
        await cleanupDirectory(outputPath);
    });
};

describe('Pdf page mode', () => {
    generateMapTestTemplate(
        'creates a pdf folder when the --pdf flag is specified',
        'mocks/pdf-page/flag-enabled',
        '-j2 --pdf',
    );

    generateMapTestTemplate(
        'creates a pdf folder when the .yfm option is specified',
        'mocks/pdf-page/yfm-config',
        '-j2',
    );
});

describe('Pdf page with titles', () => {
    generateMapTestTemplate(
        'Generates content for pdf genrator with title pages',
        'mocks/pdf-page/title-pages',
        '--pdf',
    );

    generateMapTestTemplate(
        'Generates pdf title pages as regular entries for debug purpose',
        'mocks/pdf-page/title-pages',
        '--pdf-debug',
        '',
        true,
    );
});
