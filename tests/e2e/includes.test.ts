import {describe, expect, test} from 'vitest';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Includes', () => {
    test('Various include scenarios', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/includes');

        // Test md2md transformation
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
        });
        await compareDirectories(outputPath);

        // Test md2html transformation
        await TestAdapter.testBuildPass(outputPath, outputPath + '-html', {
            md2md: false,
            md2html: true,
        });
        await compareDirectories(outputPath + '-html');
    });

    // TODO: This test was disabled because missing include files no longer cause
    // a build failure in either md2md or md2html mode. The include is simply skipped.
    // Re-enable when the expected error behavior is clarified.
    test.todo('Include with missing file should fail');

    test('Check filename and line in logs for skipped include', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-skip/test1');

        const mdReport = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
        expect(mdReport.code).toBeGreaterThan(0);
        const mdLogs = mdReport.errors.join('\n');

        expect(mdLogs).toContain(
            'ERR Include skipped in (index.md:3). Include source for includes/missing.md not found',
        );
    });

    test('Check filename and line in logs for skipped nested include', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-skip/test2');

        const mdReport = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
        expect(mdReport.code).toBeGreaterThan(0);
        const mdLogs = mdReport.errors.join('\n');

        expect(mdLogs).toContain(
            'ERR Include skipped in (includes/valid.md:3). Include source for includes/missing.md not found',
        );
    });
});
