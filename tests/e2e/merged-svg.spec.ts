import {existsSync, readFileSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {parse} from 'node-html-parser';
import {describe, expect, test} from 'vitest';

import {TestAdapter, getTestPaths} from '../fixtures';

describe('SVG assets in merged includes', () => {
    test('does not read assets from an unreferenced embedded appendix', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merged-svg-unused');
        const args = ['--merge-includes', '--no-merge-svg'];

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: args.join(' '),
        });

        const report = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
            ...args,
            '-f',
            'html',
        ]);

        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);
        expect(existsSync(join(outputPath, '_assets/missing.svg'))).toBe(false);
    });

    test('renders a declared SVG from an embedded include after md2md', async () => {
        const {inputPath, outputPath} = getTestPaths('mocks/merged-svg');
        const args = ['--merge-includes', '--no-merge-svg'];

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: args.join(' '),
        });

        expect(readFileSync(join(outputPath, 'index.md'), 'utf8')).toContain(
            '{% included (_includes/button.md) %}',
        );
        expect(existsSync(join(outputPath, '_includes/button.md'))).toBe(false);
        expect(existsSync(join(outputPath, '_assets/plus.svg'))).toBe(true);

        const report = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
            ...args,
            '-f',
            'html',
            '--static-content',
        ]);

        expect(report.errors).toEqual([]);
        expect(report.code).toBe(0);
        expect(report.warns).toEqual([]);

        for (const page of ['index', 'nested']) {
            const html = parse(readFileSync(join(`${outputPath}-html`, `${page}.html`), 'utf8'));
            expect(html.querySelector('svg[data-test="embedded-plus"]')).not.toBeNull();
        }
        expect(readFileSync(join(outputPath, 'nested.md'), 'utf8')).toContain(
            '{% included (_includes/outer.md:button.md) %}',
        );
    });

    test('keeps a real missing SVG as an error inside an embedded include', async () => {
        const paths = getTestPaths('mocks/merged-svg');
        const {inputPath} = paths;
        const outputPath = `${paths.outputPath}-missing`;
        const args = ['--merge-includes', '--no-merge-svg'];

        await TestAdapter.testBuildPass(inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: args.join(' '),
        });

        unlinkSync(join(outputPath, '_assets/plus.svg'));

        const report = await TestAdapter.build.run(outputPath, `${outputPath}-html`, [
            ...args,
            '-f',
            'html',
        ]);

        expect(report.code).toBe(1);
        expect(report.errors.some((error) => error.includes('plus.svg'))).toBe(true);
    });
});
