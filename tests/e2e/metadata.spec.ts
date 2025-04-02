import {describe, test} from 'vitest';
import {compareDirectories, createRunner, getTestPaths} from '../fixtures';

const generateMapTestTemplate = (
    testTitle: string,
    testRootPath: string,
    {md2md = true, md2html = true},
) => {
    const runner = createRunner();

    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await runner.runYfmDocs(inputPath, outputPath, {md2md, md2html});
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
