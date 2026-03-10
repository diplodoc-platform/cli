import {describe, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Merge includes (md2md)', () => {
    test('basic: simple include is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('nested: outer inlined, inner as fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/nested');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('relative-paths: inlined content has rebased paths', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/relative-paths');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('hash-fallback: includes with hash use fallback, deduped', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/hash-fallback');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('without flag: includes are NOT merged', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/basic');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--no-merge-includes',
        });
        await compareDirectories(outputPath);
    });
});
