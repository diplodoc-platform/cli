import {describe, expect, test} from 'vitest';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('VarsService ignore patterns', () => {
    test('should ignore presets files based on ignore patterns', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-ignore');

        // Test with ignore patterns via flags - should ignore ignored/ and data/ folders
        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            args: '--ignore ignored/ --ignore data/',
        });

        // Check that variables from ignored presets are not resolved
        const outputContent = readFileSync(resolve(outputPath, 'test.md'), 'utf8');
        expect(outputContent).toContain('Root var: rootValue');
        expect(outputContent).toContain('Common var: fromRoot');
        expect(outputContent).toContain('Ignored var: {{ignoredVar}}'); // Should remain unresolved
        expect(outputContent).toContain('Data var: {{dataVar}}'); // Should remain unresolved
    });

    test('should load all presets when no ignore patterns specified', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-ignore');

        // Test without ignore patterns - should load all presets
        await TestAdapter.testBuildPass(inputPath, outputPath + '-no-ignore', {
            md2md: true,
        });

        // Check that variables in subdirectories are resolved
        const ignoredContent = readFileSync(
            resolve(outputPath + '-no-ignore', 'ignored/ignored-test.md'),
            'utf8',
        );
        expect(ignoredContent).toContain('Root var: rootValue');
        expect(ignoredContent).toContain('Ignored var: ignoredValue');

        const dataContent = readFileSync(
            resolve(outputPath + '-no-ignore', 'data/data-test.md'),
            'utf8',
        );
        expect(dataContent).toContain('Root var: rootValue');
        expect(dataContent).toContain('Data var: dataValue');
    });

    test('should handle partial ignore patterns', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-ignore');

        // Test with partial ignore - should ignore only data/ folder
        await TestAdapter.testBuildPass(inputPath, outputPath + '-partial', {
            md2md: true,
            args: '--ignore data/',
        });

        // Check that ignored/ presets are loaded but data/ presets are not
        const ignoredContent = readFileSync(
            resolve(outputPath + '-partial', 'ignored/ignored-test.md'),
            'utf8',
        );
        expect(ignoredContent).toContain('Root var: rootValue');
        expect(ignoredContent).toContain('Ignored var: ignoredValue'); // Should be resolved

        const dataContent = readFileSync(
            resolve(outputPath + '-partial', 'data/data-test.md'),
            'utf8',
        );
        expect(dataContent).toContain('Root var: rootValue');
        expect(dataContent).toContain('{{dataVar}}'); // Should remain unresolved
    });

    test('should handle ignore patterns with trailing slashes normalization', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-ignore');

        // Test with various trailing slash patterns
        await TestAdapter.testBuildPass(inputPath, outputPath + '-slashes', {
            md2md: true,
            args: '--ignore ignored// --ignore data/',
        });

        // Check that both folders are ignored despite different slash patterns
        const outputContent = readFileSync(resolve(outputPath + '-slashes', 'test.md'), 'utf8');
        expect(outputContent).toContain('Root var: rootValue');
        expect(outputContent).toContain('Common var: fromRoot');
        expect(outputContent).toContain('Ignored var: {{ignoredVar}}'); // Should remain unresolved
        expect(outputContent).toContain('Data var: {{dataVar}}'); // Should remain unresolved
    });

    test('should ignore top-level presets when using custom config for nested docs', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/nested-docs');

        // Test nested docs scenario - use custom config that ignores everything except subdoc/
        await TestAdapter.testBuildPass(inputPath, outputPath + '-nested', {
            md2md: true,
            args: '--config .yfm-subdoc',
        });

        // Check that subdoc files are processed and variables are resolved correctly
        const subDocContent = readFileSync(
            resolve(outputPath + '-nested', 'subdoc/index.md'),
            'utf8',
        );
        expect(subDocContent).toContain('Sub var: subValue'); // Should be resolved from subdoc presets
        expect(subDocContent).toContain('Common var: fromSub'); // Should use subdoc override
        expect(subDocContent).toContain('{{topLevelVar}}'); // Should remain unresolved (top-level presets ignored)

        // Verify that top-level presets.yaml was ignored by checking that top-level variables are not available
        expect(subDocContent).not.toContain('topLevelValue');
    });

    test('should not load any presets when using custom config with disabled template vars', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/nested-docs');

        // Test with custom config and --no-template-vars - should not load any presets at all
        await TestAdapter.testBuildPass(inputPath, outputPath + '-no-vars-config', {
            md2md: true,
            args: '--config .yfm-subdoc --no-template-vars',
        });

        // Check that ALL variables remain unresolved (no presets loaded at all)
        const subDocContent = readFileSync(
            resolve(outputPath + '-no-vars-config', 'subdoc/index.md'),
            'utf8',
        );
        expect(subDocContent).toContain('{{subVar}}'); // Should remain unresolved
        expect(subDocContent).toContain('{{commonVar}}'); // Should remain unresolved
        expect(subDocContent).toContain('{{topLevelVar}}'); // Should remain unresolved

        // Verify that no variables were resolved at all
        expect(subDocContent).not.toContain('Sub var: subValue');
        expect(subDocContent).not.toContain('Common var: fromSub');
        expect(subDocContent).not.toContain('Top level var: topLevelValue');
    });

    test('should not load any presets when template vars are disabled', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/vars-ignore');

        // Test with --no-template-vars flag - should not load any presets
        await TestAdapter.testBuildPass(inputPath, outputPath + '-no-vars', {
            md2md: true,
            args: '--no-template-vars',
        });

        // Check that ALL variables remain unresolved (no presets loaded)
        const outputContent = readFileSync(resolve(outputPath + '-no-vars', 'test.md'), 'utf8');
        expect(outputContent).toContain('{{rootVar}}'); // Should remain unresolved
        expect(outputContent).toContain('{{commonVar}}'); // Should remain unresolved
        expect(outputContent).toContain('{{ignoredVar}}'); // Should remain unresolved
        expect(outputContent).toContain('{{dataVar}}'); // Should remain unresolved

        // Check subdirectory files - variables should also remain unresolved
        const ignoredContent = readFileSync(
            resolve(outputPath + '-no-vars', 'ignored/ignored-test.md'),
            'utf8',
        );
        expect(ignoredContent).toContain('{{rootVar}}'); // Should remain unresolved
        expect(ignoredContent).toContain('{{ignoredVar}}'); // Should remain unresolved

        const dataContent = readFileSync(
            resolve(outputPath + '-no-vars', 'data/data-test.md'),
            'utf8',
        );
        expect(dataContent).toContain('{{rootVar}}'); // Should remain unresolved
        expect(dataContent).toContain('{{dataVar}}'); // Should remain unresolved
    });
});
