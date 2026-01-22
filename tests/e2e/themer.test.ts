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
        expect(css).toContain('--g-color-text-link: green;');
        expect(css).toContain('--g-color-text-link: blue;');
        expect(css).toContain('--yfm-color-note-info-background: red;');
    });

    it.each([
        ['md2md', true, false],
        ['md2html', false, true],
    ])('generates theme.css with theme.yaml and flag falue (%s)', async (_, md2md, md2html) => {
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
        expect(css).toContain('--g-color-text-link: green;');
        expect(css).toContain('--g-color-text-link: blue;');
        expect(css).toContain('--yfm-color-note-info-background: red;');
    });

    it.each([
        ['md2md', true, false],
        ['md2html', false, true],
    ])('generates theme.css from flag falue only (%s)', async (_, md2md, md2html) => {
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
        expect(report.errors.includes('ERR Invalid color: pinkk')).toBe(true);
        expect(report.errors.includes('ERR Invalid color: redd')).toBe(true);
    });
});
