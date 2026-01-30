import {describe, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('Build themer feature', () => {
    it.each([
        ['md2md', true, false],
        ['md2html', false, true],
    ])('generates theme.css from theme.yaml (%s)', async (_, md2md, md2html) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test1');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md,
            md2html,
        });

        const cssPath = join(outputPath, '_assets', 'style', 'theme.css');
        const css = await readFile(cssPath, 'utf8');

        expect(css).toContain('--g-color-base-brand: var(--g-color-private-base-brand-550-solid);');
        expect(css).toContain('--g-color-private-base-brand-550-solid: rgb(255 0 0);');
        expect(css).toContain('--g-color-private-base-brand-600-solid: rgb(255 25 25);');
        expect(css).toContain('--yfm-color-link: green;');
        expect(css).toContain('--yfm-color-link: blue;');
        expect(css).toContain('--g-color-base-selection: rgb(255 0 255);');
        expect(css).toContain('--g-color-base-background: hsl(60 100% 50%);');
        expect(css).toContain('--g-color-base-background: rgba(255, 165, 0, 1);');
        expect(css).toContain('--g-color-base-selection: hsla(0 0% 50% / 1);');
        expect(css).toContain('--yfm-color-note-info-background: red;');
    });

    it.each([
        ['md2md', true, false],
        ['md2html', false, true],
    ])('generates theme.css with theme.yaml and flag value (%s)', async (_, md2md, md2html) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test1');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md,
            md2html,
            args: '--theme pink',
        });

        const cssPath = join(outputPath, '_assets', 'style', 'theme.css');
        const css = await readFile(cssPath, 'utf8');

        expect(css).toContain('--g-color-base-brand: var(--g-color-private-base-brand-550-solid);');
        expect(css).toContain('--g-color-private-base-brand-550-solid: rgb(255 192 203);');
        expect(css).toContain('--g-color-private-base-brand-600-solid: rgb(234 177 188);');
        expect(css).toContain('--yfm-color-link: green;');
        expect(css).toContain('--yfm-color-link: blue;');
        expect(css).toContain('--g-color-base-selection: rgb(255 0 255);');
        expect(css).toContain('--g-color-base-background: hsl(60 100% 50%);');
        expect(css).toContain('--g-color-base-background: rgba(255, 165, 0, 1);');
        expect(css).toContain('--g-color-base-selection: hsla(0 0% 50% / 1);');
        expect(css).toContain('--yfm-color-note-info-background: red;');
    });

    it.each([
        ['md2md', true, false],
        ['md2html', false, true],
    ])('generates theme.css from flag value only (%s)', async (_, md2md, md2html) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test3');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md,
            md2html,
            args: '--theme pink',
        });

        const cssPath = join(outputPath, '_assets', 'style', 'theme.css');
        const css = await readFile(cssPath, 'utf8');

        expect(existsSync(join(inputPath, 'theme.yaml'))).toBe(false);
        expect(css).toContain('--g-color-base-brand: var(--g-color-private-base-brand-550-solid);');
        expect(css).toContain('--g-color-private-base-brand-550-solid: rgb(255 192 203);');
        expect(css).toContain('--g-color-private-base-brand-600-solid: rgb(234 177 188);');
    });

    it('custom styles override theme colors', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test1');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
            args: '--allow-custom-resources true',
        });

        const htmlPath = join(outputPath, 'index.html');
        const html = await readFile(htmlPath, 'utf8');

        const themeIndex = html.indexOf('_assets/style/theme.css');
        const customIndex = html.indexOf('_assets/style/custom.css');
        expect(customIndex).toBeGreaterThan(themeIndex);
    });

    it('does not generates theme.css if not theme.yaml and flag', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test3');

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: false,
            md2html: true,
        });

        const htmlPath = join(outputPath, 'index.html');
        const html = await readFile(htmlPath, 'utf8');

        const themeIndex = html.indexOf('_assets/style/theme.css');
        expect(themeIndex).toBe(-1);

        const themePath = join(outputPath, '_assets', 'style', 'theme.css');
        expect(existsSync(themePath)).toBe(false);
    });

    it.each([
        ['md2md', 'md'],
        ['md2html', 'html'],
    ])('includes errors for invalid colors from theme.yaml and flag (%s)', async (_, format) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test2');

        const report = await TestAdapter.build.run(inputPath, outputPath, [
            '-f',
            format,
            '--theme',
            'pinkk',
        ]);

        expect(report.code).toBe(1);
        expect(report.errors.includes('ERR Invalid color: "pinkk"')).toBe(true);
        expect(report.errors.includes('ERR Invalid color: "redd"')).toBe(true);
        expect(report.errors.includes('ERR /dark/link must be string')).toBe(true);
        expect(report.errors.includes('ERR Invalid color: "5"')).toBe(true);
        expect(report.errors.includes('ERR Invalid color: ""')).toBe(true);
        expect(report.errors.includes('ERR Invalid color: " "')).toBe(true);
    });

    it.each([
        ['md2md', 'md'],
        ['md2html', 'html'],
    ])('warns about unknown color keys in theme.yaml (%s)', async (_, format) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test1');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', format]);

        expect(report.code).toBe(0);
        expect(
            report.warns.includes(
                'WARN File theme.yaml must NOT have additional properties "base-brandd"',
            ),
        ).toBe(true);
        expect(
            report.warns.includes('WARN /dark must NOT have additional properties "unknown-color"'),
        ).toBe(true);
    });

    it.each([
        ['md2md', 'md'],
        ['md2html', 'html'],
    ])('includes errors for invalid syntax in theme.yaml (%s)', async (_, format) => {
        const {inputPath, outputPath} = getTestPaths('mocks/themer/test4');

        const report = await TestAdapter.build.run(inputPath, outputPath, ['-f', format]);

        expect(report.code).toBe(1);
        expect(
            report.errors.includes(
                'ERR Failed to generate theme: YAMLException: bad indentation of a mapping entry (3:5)',
            ),
        ).toBe(true);
    });
});
