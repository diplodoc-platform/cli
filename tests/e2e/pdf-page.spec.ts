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

const generateMd2mdTestTemplate = async (testTitle: string, testRootPath: string) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--allow-custom-resources', // this is common arg in arc ci for md2md
        });

        await compareDirectories(outputPath, true);

        const midOutputFolder = 'final-output';
        const finalOutputPath = outputPath
            .split('/')
            .slice(0, -1)
            .concat(midOutputFolder)
            .join('/');

        await TestAdapter.testBuildPass(outputPath, finalOutputPath, {
            md2md: false,
            md2html: true,
        });

        await compareDirectories(finalOutputPath, true);

        await cleanupDirectory(outputPath);
        await cleanupDirectory(finalOutputPath);
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

describe('Pdf generation with md2md phase, only files structure', () => {
    generateMd2mdTestTemplate(
        'Generates md2md content, then uses it for md2html render with pdf when .yfm options is specified',
        'mocks/pdf-page/title-pages',
    );
});
