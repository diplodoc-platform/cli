import {describe, expect, test} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {TestAdapter, compareDirectories, getTestPaths} from '../fixtures';

describe('Cleanup empty directories with stage filtering', () => {
    test('should cleanup directories that contain only presets.yaml when TOC is ignored by stage', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/cleanup-empty-dirs');

        // Test with disabled templating to trigger cleanupEmptyDirectories
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            args: '--no-template',
        });

        // Verify that the output directory structure is correct
        await compareDirectories(outputPath, false, false, true);

        // Check that active section files are present
        expect(existsSync(resolve(outputPath, 'active/page.md'))).toBe(true);
        expect(existsSync(resolve(outputPath, 'active/presets.yaml'))).toBe(true);
        expect(existsSync(resolve(outputPath, 'active/toc.yaml'))).toBe(true);

        expect(existsSync(resolve(outputPath, 'empty-section'))).toBe(true);
        expect(existsSync(resolve(outputPath, 'empty-section/presets.yaml'))).toBe(true);

        // Check that root files are present
        expect(existsSync(resolve(outputPath, 'index.md'))).toBe(true);
        expect(existsSync(resolve(outputPath, 'presets.yaml'))).toBe(true);
        expect(existsSync(resolve(outputPath, 'toc.yaml'))).toBe(true);
    });

    test('should not cleanup directories when templating is enabled', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/cleanup-empty-dirs');

        // Test with enabled templating - cleanup should not be triggered
        await TestAdapter.testBuildPass(inputPath, outputPath + '-with-template', {
            md2md: true,
            args: '', // Default template enabled
        });

        // Check that empty-section directory exists (cleanup should not be triggered)
        expect(existsSync(resolve(outputPath + '-with-template', 'empty-section'))).toBe(false);
        expect(
            existsSync(resolve(outputPath + '-with-template', 'empty-section/presets.yaml')),
        ).toBe(false);

        // Check that active section files are present
        expect(existsSync(resolve(outputPath + '-with-template', 'active/page.md'))).toBe(true);
        expect(existsSync(resolve(outputPath + '-with-template', 'active/presets.yaml'))).toBe(
            false,
        );

        // Check that root files are present
        expect(existsSync(resolve(outputPath + '-with-template', 'index.md'))).toBe(true);
        expect(existsSync(resolve(outputPath + '-with-template', 'presets.yaml'))).toBe(false);
    });
});
