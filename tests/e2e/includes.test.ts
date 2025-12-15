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

    test('Include with missing file should fail', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/includes-missing');

        // Test md2md transformation should fail
        const mdReport = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'md']);
        expect(mdReport.code).toBeGreaterThan(0);

        // Test md2html transformation should fail
        const htmlReport = await TestAdapter.build.run(inputPath, outputPath + '-html', [
            '-f',
            'html',
        ]);
        expect(htmlReport.code).toBeGreaterThan(0);
    });

    test('Check filename and line in logs for skipped include', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-skip/test1');

        const mdReport = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
        expect(mdReport.code).toBeGreaterThan(0);
        const mdLogs = mdReport.errors.join('\n');

        expect(mdLogs).toContain('ERR Include skipped in (index.md:3). Include source for includes/missing.md not found');
    });

     test('Check filename and line in logs for skipped nested include', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/include-skip/test2');

        const mdReport = await TestAdapter.build.run(inputPath, outputPath, ['-f', 'html']);
        expect(mdReport.code).toBeGreaterThan(0);
        const mdLogs = mdReport.errors.join('\n');

        expect(mdLogs).toContain('ERR Include skipped in (includes/valid.md:3). Include source for includes/missing.md not found');
    });
});
