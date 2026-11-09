import {once} from 'node:events';
import {existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {execa} from 'execa';
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

    test('rebuilds pages when an SVG in a reachable embedded include changes', async () => {
        const paths = getTestPaths('mocks/merged-svg');
        const outputPath = `${paths.outputPath}-watch`;
        const htmlPath = `${outputPath}-html`;
        const args = ['--merge-includes', '--no-merge-svg'];

        await TestAdapter.testBuildPass(paths.inputPath, outputPath, {
            md2md: true,
            md2html: false,
            args: args.join(' '),
        });

        expect(existsSync(join(outputPath, '_includes/button.md'))).toBe(false);
        expect(existsSync(join(outputPath, '_includes/outer.md'))).toBe(false);
        expect(readFileSync(join(outputPath, 'nested.md'), 'utf8')).toContain(
            '{% included (_includes/outer.md:button.md) %}',
        );

        const probePath = join(outputPath, '_assets/watch-ready.svg');
        const probeSvg = readFileSync(join(outputPath, '_assets/plus.svg'), 'utf8').replace(
            'embedded-plus',
            'watch-ready',
        );
        writeFileSync(probePath, probeSvg);
        writeFileSync(
            join(outputPath, 'watch-ready.md'),
            '# Watch readiness\n\n![Ready](_assets/watch-ready.svg)\n',
        );
        writeFileSync(
            join(outputPath, 'toc.yaml'),
            'title: Embedded SVG\nhref: index.md\nitems:\n' +
                '  - name: Nested\n    href: nested.md\n' +
                '  - name: Watch readiness\n    href: watch-ready.md\n',
        );

        const binary =
            process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
        const watch = execa(
            binary,
            [
                '--input',
                outputPath,
                '--output',
                htmlPath,
                '--allowHtml',
                ...args,
                '-f',
                'html',
                '--static-content',
                '--watch',
                '--no-vcs',
                '-j',
                '1',
            ],
            {
                env: {...process.env, NODE_ENV: 'test'},
                stdin: 'ignore',
                stdout: 'pipe',
                stderr: 'pipe',
                reject: false,
            },
        );
        const closed = once(watch, 'close');
        let logs = '';
        watch.stdout.on('data', (chunk) => {
            logs += chunk;
        });
        watch.stderr.on('data', (chunk) => {
            logs += chunk;
        });

        const hasSvg = (page: string, marker: string) => {
            if (watch.exitCode !== null) {
                throw new Error(`Watch process exited with code ${watch.exitCode}:\n${logs}`);
            }
            const file = join(htmlPath, `${page}.html`);
            return (
                existsSync(file) &&
                parse(readFileSync(file, 'utf8')).querySelector(`svg[data-test="${marker}"]`) !==
                    null
            );
        };

        try {
            await expect
                .poll(() => ['index', 'nested'].every((page) => hasSvg(page, 'embedded-plus')), {
                    timeout: 15000,
                })
                .toBe(true);

            // The startup message precedes chokidar's ready event. A separate page proves that
            // events are being processed without rebuilding either embedded-include target.
            await expect
                .poll(
                    () => {
                        if (hasSvg('watch-ready', 'watch-ready-updated')) {
                            return true;
                        }
                        writeFileSync(
                            probePath,
                            probeSvg.replace('watch-ready', 'watch-ready-updated'),
                        );
                        return false;
                    },
                    {timeout: 15000, interval: 100},
                )
                .toBe(true);

            const svgPath = join(outputPath, '_assets/plus.svg');
            writeFileSync(
                svgPath,
                readFileSync(svgPath, 'utf8').replace('embedded-plus', 'embedded-plus-updated'),
            );

            await expect
                .poll(
                    () =>
                        ['index', 'nested'].every((page) => hasSvg(page, 'embedded-plus-updated')),
                    {timeout: 15000},
                )
                .toBe(true);
            expect(logs).not.toMatch(/\bERR\b/);
        } finally {
            watch.kill('SIGTERM');
            const forceKill = setTimeout(() => watch.kill('SIGKILL'), 5000);
            await closed;
            clearTimeout(forceKill);
        }
    });
});
