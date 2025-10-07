import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (testTitle: string, testRootPath: string, args: string) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args,
        });

        await compareDirectories(`${outputPath}/pdf`);
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
