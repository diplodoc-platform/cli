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

    test('hash-section: includes with hash extract sections inline', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/hash-fallback');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('term-inline: includes inside term defs use fallback (not inlined)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/term-inline');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes --multiline-term-definitions',
        });
        await compareDirectories(outputPath);
    });

    test('inline-context: non-standalone includes use fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/inline-context');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('term-extract: dep with terms → terms extracted, content inlined (Step 4)', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/term-extract');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes --multiline-term-definitions',
        });
        await compareDirectories(outputPath);
    });

    test('yfm-table: include followed by || separator is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/yfm-table');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('yfm-table: include ending with HTML block places || on its own line', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/yfm-table-html-block');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('yfm-table: include with `|` in inline code falls back to {% included %}', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/yfm-table-pipe-in-content',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('indent-paragraph: include under indent with indented top-level paragraph falls back to {% included %}', async () => {
        const {inputPath, outputPath} = getTestPaths(
            'mocks/merge-includes/indent-paragraph-in-include',
        );

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('html-in-list: include with <style> in list (any indent) uses fallback', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/html-in-list');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('hash-section-html: hash-section include in list is inlined when only other section has <style>', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/hash-section-html');

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

    test('html-comment-blanks: blank lines inside HTML comments keep list/cut continuity', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/html-comment-blanks');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('include-in-code-block: include shown as code example is NOT expanded', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/include-in-code-block');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });

    test('include-after-fence: include placed right after a closing ``` fence is inlined', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merge-includes/include-after-fence');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: '--merge-includes',
        });
        await compareDirectories(outputPath);
    });
});
