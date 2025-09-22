import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Include toc', () => {
    test('Toc is included in link mode', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test1');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });

    test('Toc is included inline, not as a new section', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test2');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });

    test('Nested toc inclusions with mixed including modes', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test3');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });

    test('Nested toc inclusions with mixed including modes 2', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test5');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });

    test('Toc with expressions', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test4');
        const vars = {
            type: 'a',
            a: 'A',
            b: 'B',
        };

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            args: `--vars=${JSON.stringify(vars)}`,
        });
        await compareDirectories(outputPath);
    });

    test('Toc with generic includer', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test6');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });

    test('Toc root merge on non root dir', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-toc/test7');
        await TestAdapter.testBuildPass(inputPath, outputPath);
        await compareDirectories(outputPath);
    });
});
