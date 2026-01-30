import {describe, expect, test} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Empty presets.yaml handling', () => {
    test('should not create empty presets.yaml files in md output format when no variables are used', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/empty-presets');

        // Test with --output-format=md and disabled templating
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            args: '-f md --no-template',
        });

        // Check that presets.yaml file was NOT created in the output
        const presetsPath = resolve(outputPath, 'presets.yaml');
        expect(existsSync(presetsPath)).toBe(false);

        // Check that subfolder presets.yaml file was NOT created in the output
        const subfolderPresetsPath = resolve(outputPath, 'subfolder/presets.yaml');
        expect(existsSync(subfolderPresetsPath)).toBe(false);

        // Verify that the markdown files were still processed correctly
        const indexContent = readFileSync(resolve(outputPath, 'index.md'), 'utf8');
        expect(indexContent).toContain('Test Page');

        const subpageContent = readFileSync(resolve(outputPath, 'subfolder/subpage.md'), 'utf8');
        expect(subpageContent).toContain('Sub Page');
    });
});
