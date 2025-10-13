import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (testTitle: string, testRootPath: string) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '-j2 --skip-html-extension',
        });
        await compareDirectories(outputPath);
    });
};

describe('Skip html extension', () => {
    generateMapTestTemplate(
        'correctly trims .html and index.html on multilingual docs',
        'mocks/skip-html-extension/multilingual',
    );

    generateMapTestTemplate(
        'correctly trims .html and index.html on monolingual docs',
        'mocks/skip-html-extension/monolingual',
    );
});
