import {describe, test} from 'vitest';
import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

const generateFilesYamlTestTemplate = (
    testTitle: string,
    testRootPath: string,
    args: string[] = [],
) => {
    test(testTitle, async () => {
        const {inputPath, outputPath} = getTestPaths(testRootPath);
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md:true,
            md2html: false,
            args: args.join(' '),
        });
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
            args: args.join(' '),
        });
        await compareDirectories(outputPath);
    });
};

describe('Preprocess', () => {
    generateFilesYamlTestTemplate('HashIncludes=true,Autotitles=false', 'mocks/preprocess', [
        '--no-merge-autotitles'
    ]);

    generateFilesYamlTestTemplate('HashIncludes=true,Autotitles=true', 'mocks/preprocess');

    // generateFilesYamlTestTemplate('Nested toc restricted access', 'mocks/preprocess/test3');
});
