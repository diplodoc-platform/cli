import type {BuildConfig} from '.';

import {describe, expect, it, vi} from 'vitest';
import {constants as fsConstants} from 'node:fs/promises';

import {combineProps, fileSizeConverter} from './config';
import {
    handler,
    runBuild as run,
    testConfig as test,
    testBooleanFlag,
    testNestedBooleanFlag,
} from './__tests__';
import {Run} from './run';

describe('Build command', () => {
    describe('config', () => {
        it('should fail without required output prop', async () => {
            await expect(() => run('--input ./input')).rejects.toThrow(
                `error: required option '-o, --output <string>' not specified`,
            );
        });

        it('should handle required props in args', async () => {
            await run('--input ./input --output ./output');

            expect(handler).toBeCalled();
        });

        describe('input', () => {
            test('should be absolute', '--input ./input', {
                input: expect.stringMatching(/^(\/|[A-Z]:\\).*?(\/|\\)input$/),
            });
        });

        describe('output', () => {
            test('should be absolute', '--output ./output', {
                output: expect.stringMatching(/^(\/|[A-Z]:\\).*?(\/|\\)output$/),
            });
        });

        describe('metadata', () => {
            test('should handle default', '', {
                rawAddMeta: false,
                addSystemMeta: false,
                addResourcesMeta: true,
                addMetadataMeta: true,
            });

            test(
                'should handle config',
                '',
                {
                    rawAddMeta: true,
                    addResourcesMeta: false,
                    addMetadataMeta: false,
                },
                {
                    rawAddMeta: true,
                    addResourcesMeta: false,
                    addMetadataMeta: false,
                },
            );
        });

        describe('langs', () => {
            test('should handle default', '', {
                langs: ['ru'],
            });

            test('should handle arg', '--langs en', {
                langs: ['en'],
            });

            test('should handle shorthand arg', '--lang en', {
                langs: ['en'],
            });

            test('should handle multiple arg', '--lang en --lang ru', {
                langs: ['en', 'ru'],
            });

            test('should handle multiple different arg', '--lang en --langs ru', {
                langs: ['en', 'ru'],
            });

            test(
                'should handle config',
                '',
                {
                    langs: ['ru', 'en'],
                },
                {
                    langs: ['ru', 'en'],
                },
            );

            test(
                'should handle empty config',
                '',
                {
                    langs: [],
                },
                {
                    langs: ['ru'],
                },
            );

            test(
                'should fail on unlisted lang',
                '',
                {
                    // @ts-ignore
                    lang: 'fr',
                    langs: ['ru', 'en'],
                },
                new Error(`Configured default lang 'fr' is not listed in langs (ru, en)`),
            );
        });

        describe('lang', () => {
            test('should handle default', '', {
                lang: 'ru',
            });

            test(
                'should handle config',
                '',
                {
                    lang: 'en',
                },
                {
                    lang: 'en',
                },
            );

            test(
                'should handle first lang from langs',
                '',
                {
                    langs: ['en', 'ru'],
                },
                {
                    lang: 'en',
                },
            );
        });

        describe('outputFormat', () => {
            test('should handle default', '', {
                outputFormat: 'html',
            });

            test('should handle arg', '--output-format md', {
                outputFormat: 'md',
            });

            test('should handle shorthand arg', '-f md', {
                outputFormat: 'md',
            });

            test(
                'should handle config',
                '',
                {
                    outputFormat: 'md',
                },
                {
                    outputFormat: 'md',
                },
            );

            it('should fail on unknown format', async () => {
                await expect(() =>
                    run('--input ./input --output ./output --output-format other'),
                ).rejects.toThrow(
                    `error: option '-f, --output-format <value>' argument 'other' is invalid. Allowed choices are html, md.`,
                );
            });
        });

        describe('varsPreset', () => {
            test('should handle default', '', {
                varsPreset: 'default',
            });

            test('should handle arg', '--vars-preset public', {
                varsPreset: 'public',
            });

            test(
                'should handle config',
                '',
                {
                    varsPreset: 'public',
                },
                {
                    varsPreset: 'public',
                },
            );
        });

        describe('vars', () => {
            test('should handle default', '', {
                vars: {},
            });

            test('should handle arg', '--vars {"a":1}', {
                vars: {a: 1},
            });

            test('should handle shorthand arg', '-v {"a":1}', {
                vars: {a: 1},
            });

            test(
                'should handle config',
                '',
                {
                    vars: {a: 1},
                },
                {
                    vars: {a: 1},
                },
            );

            // TODO: should merge args ang config
            // test('should merge args ang config')
        });

        describe('ignoreStage', () => {
            test('should handle default', '', {
                ignoreStage: ['skip'],
            });

            test('should handle arg', '--ignore-stage preview', {
                ignoreStage: ['preview'],
            });

            test(
                'should handle config',
                '',
                {
                    ignoreStage: ['preview'],
                },
                {
                    ignoreStage: ['preview'],
                },
            );

            test(
                'should handle simplified config',
                '',
                {
                    // @ts-ignore
                    ignoreStage: 'preview',
                },
                {
                    ignoreStage: ['preview'],
                },
            );
        });

        describe('ignore', () => {
            test('should handle default', '', {
                ignore: [],
            });

            test('should handle arg', '--ignore **/*.md', {
                ignore: ['**/*.md'],
            });

            test('should handle args', '--ignore **/*.md --ignore **/*.yaml', {
                ignore: ['**/*.md', '**/*.yaml'],
            });

            test(
                'should handle config',
                '',
                {
                    ignore: ['**/*.md'],
                },
                {
                    ignore: ['**/*.md'],
                },
            );

            // TODO: should merge args ang config
            // test('should merge args ang config')
        });

        describe('strict', () => {
            test('should handle default', '', {
                strict: false,
            });

            test('should handle arg', '--strict', {
                strict: true,
            });

            // test('should handle arg', arg, {
            //     [name]: true,
            // });

            test(
                'should handle config enabled',
                '',
                {
                    strict: true,
                },
                {
                    strict: true,
                },
            );

            test(
                'should handle config disabled',
                '',
                {
                    strict: false,
                },
                {
                    strict: false,
                },
            );

            test(
                'should prioritize CLI arg over config',
                '--strict',
                {strict: false},
                {strict: true},
            );

            test(
                'should prioritize CLI no-strict over config',
                '--no-strict',
                {strict: true},
                {strict: false},
            );
        });

        describe('vcs', () => {
            test('should handle default', '', {
                vcs: {enabled: false},
                vcsPath: {enabled: true},
            });

            test('should handle arg', '--vcs', {
                vcs: {enabled: true},
            });

            test(
                'should handle simple config',
                '',
                {
                    // @ts-ignore
                    vcs: true,
                },
                {
                    vcs: {enabled: true},
                },
            );

            test(
                'should handle complex config 1',
                '',
                {
                    vcs: {enabled: true},
                },
                {
                    vcs: {enabled: true},
                },
            );

            test(
                'should handle complex config 1',
                '',
                {
                    vcs: {enabled: false},
                },
                {
                    vcs: {enabled: false},
                },
            );

            test('should handle arg', '--no-vcs-path', {
                vcsPath: {enabled: false},
            });

            test(
                'should handle vcsPath config',
                '',
                {
                    vcsPath: {enabled: false},
                },
                {
                    vcsPath: {enabled: false},
                },
            );
        });

        describe('vcsToken', () => {
            test('should handle default', '', {
                vcs: {enabled: false},
            });

            test('should handle arg', '--vcs-token A', {
                vcs: {
                    enabled: false,
                    token: 'A',
                },
            });

            test(
                'should throw if token passed to config',
                '',
                {
                    vcs: {
                        enabled: true,
                        token: 'A',
                    },
                },
                new Error('Do not store secret VCS token in config. Use args or env.'),
            );
        });

        describe('preprocess', () => {
            test('should handle default', '', {
                preprocess: {
                    hashIncludes: true,
                    mergeIncludes: false,
                    mergeAutotitles: true,
                    disableMetaMaxLineWidth: false,
                },
            });

            test('should handle arg hashIncludes', '--hash-includes', {
                preprocess: {
                    hashIncludes: true,
                },
            });

            test('should handle arg mergeIncludes', '--merge-includes', {
                preprocess: {
                    mergeIncludes: true,
                },
            });

            test('should handle arg mergeAutotitles', '--merge-autotitles', {
                preprocess: {
                    mergeAutotitles: true,
                },
            });

            test('should handle arg disableMetaMaxLineWidth', '--disable-meta-max-line-width', {
                preprocess: {
                    disableMetaMaxLineWidth: true,
                },
            });

            test(
                'should handle mergeAutotitles=false',
                '',
                {
                    preprocess: {
                        mergeAutotitles: false,
                    },
                },
                {
                    preprocess: {
                        mergeAutotitles: false,
                    },
                },
            );

            test(
                'should handle disableMetaMaxLineWidth=false',
                '',
                {
                    preprocess: {
                        disableMetaMaxLineWidth: false,
                    },
                },
                {
                    preprocess: {
                        disableMetaMaxLineWidth: false,
                    },
                },
            );

            test(
                'should handle mergeIncludes=true',
                '',
                {
                    preprocess: {
                        mergeIncludes: true,
                    },
                },
                {
                    preprocess: {
                        mergeIncludes: true,
                    },
                },
            );

            test(
                'should handle mergeIncludes=false',
                '',
                {
                    preprocess: {
                        mergeIncludes: false,
                    },
                },
                {
                    preprocess: {
                        mergeIncludes: false,
                    },
                },
            );
        });

        describe('pdf', () => {
            test('should handle default', '', {
                pdf: {
                    enabled: false,
                },
            });

            test('should enable pdf when flag is present', '--pdf', {
                pdf: {enabled: true},
            });
        });

        describe('--pdf-debug arg', () => {
            test('should handle default', '', {
                pdfDebug: false,
            });

            test('should enable pdfDebug when arg is present', '--pdf-debug', {
                pdfDebug: true,
            });
        });

        describe('maxInlineSvgSize', () => {
            test('should handle default', '', {
                content: {
                    maxInlineSvgSize: 2 * 1024 ** 2, // 2M in bytes
                },
            });

            test('should handle arg with K unit', '--max-inline-svg-size 128K', {
                content: {
                    maxInlineSvgSize: 128 * 1024, // 128K in bytes
                },
            });

            test('should handle arg with M unit', '--max-inline-svg-size 4M', {
                content: {
                    maxInlineSvgSize: 4 * 1024 ** 2, // 4M in bytes
                },
            });

            test(
                'should handle config with K unit',
                '',
                {
                    content: {
                        maxInlineSvgSize: 512 * 1024, // 512K in bytes
                    },
                },
                {
                    content: {
                        maxInlineSvgSize: 512 * 1024, // 512K in bytes
                    },
                },
            );

            test('should limit to max value when exceeding 16M', '--max-inline-svg-size 20M', {
                content: {
                    maxInlineSvgSize: 16 * 1024 ** 2, // Limited to 16M in bytes
                },
            });
        });

        describe('maxAssetSize', () => {
            test('should handle default', '', {
                content: {
                    maxAssetSize: 64 * 1024 ** 2, // 64M in bytes
                },
            });

            test('should handle arg with K unit', '--max-asset-size 128K', {
                content: {
                    maxAssetSize: 128 * 1024, // 128K in bytes
                },
            });

            test('should handle arg with M unit', '--max-asset-size 4M', {
                content: {
                    maxAssetSize: 4 * 1024 ** 2, // 4M in bytes
                },
            });

            test('should handle arg with zero value to disable', '--max-asset-size 0', {
                content: {
                    maxAssetSize: 64 * 1024 ** 2, // Should use default when 0 is specified
                },
            });

            test(
                'should handle config with K unit',
                '',
                {
                    content: {
                        maxAssetSize: 512 * 1024, // 512K in bytes
                    },
                },
                {
                    content: {
                        maxAssetSize: 512 * 1024, // 512K in bytes
                    },
                },
            );

            test(
                'should handle config with M unit',
                '',
                {
                    content: {
                        maxAssetSize: 32 * 1024 ** 2, // 32M in bytes
                    },
                },
                {
                    content: {
                        maxAssetSize: 32 * 1024 ** 2, // 32M in bytes
                    },
                },
            );
        });

        testBooleanFlag('addMapFile', '--add-map-file', false);
        testBooleanFlag('allowCustomResources', '--allow-custom-resources', false);
        testBooleanFlag('staticContent', '--static-content', false);
        testBooleanFlag('addSystemMeta', '--add-system-meta', false);
        testBooleanFlag('allowHtml', '--allow-html', true);
        testBooleanFlag('sanitizeHtml', '--sanitize-html', true);

        testNestedBooleanFlag('interfaceToc', '--interface-toc', true, ['interface', 'toc']);
        testNestedBooleanFlag('interfaceSearch', '--interface-search', true, [
            'interface',
            'search',
        ]);
        testNestedBooleanFlag('interfaceFeedback', '--interface-feedback', true, [
            'interface',
            'feedback',
        ]);

        testBooleanFlag('originAsInput', '--origin-as-input', false);

        testBooleanFlag('copyOnWrite', '--copy-on-write', true);

        test(
            'should prioritize CLI no-copy-on-write over config',
            '--no-copy-on-write',
            {copyOnWrite: true},
            {copyOnWrite: false},
        );

        describe('workerMaxOldSpace', () => {
            test('should handle default', '', {
                workerMaxOldSpace: 0,
            });

            test('should handle arg', '--worker-max-old-space 512', {
                workerMaxOldSpace: 512,
            });

            test(
                'should handle config',
                '',
                {
                    workerMaxOldSpace: 1024,
                },
                {
                    workerMaxOldSpace: 1024,
                },
            );

            test(
                'should prioritize CLI arg over config',
                '--worker-max-old-space 256',
                {workerMaxOldSpace: 1024},
                {workerMaxOldSpace: 256},
            );
        });

        // test('should handle required props in config', '', {
        //     input: './input',
        //     output: './output',
        // }, {
        //     input: './input',
        //     output: './output',
        // });
    });

    describe('utilities', () => {
        describe('combineProps', () => {
            it('should combine properties from config and args correctly', () => {
                const config: Hash = {
                    output: './output' as AbsolutePath,
                    content: {
                        maxInlineSvgSize: 1024,
                    },
                };

                const args: Hash = {
                    maxInlineSvgSize: {
                        defaultValue: 2048,
                        parseArg: (value: unknown) => Number(value),
                    },
                };

                const result = combineProps(
                    config as BuildConfig,
                    'content',
                    ['maxInlineSvgSize'],
                    args,
                );

                expect(result).toEqual({
                    maxInlineSvgSize: 1024,
                });
            });

            it('should use arg value when config value is null', () => {
                const config: Hash = {
                    output: './output',
                    maxInlineSvgSize: 2048, // This is the arg value
                    content: {},
                };

                const args: Hash = {
                    maxInlineSvgSize: {
                        defaultValue: 1024,
                        parseArg: (value: unknown) => Number(value),
                    },
                };

                const result = combineProps(
                    config as BuildConfig,
                    'content',
                    ['maxInlineSvgSize'],
                    args,
                );

                expect(result).toEqual({
                    maxInlineSvgSize: 2048,
                });
            });

            it('should parse arg value when parseArg function is provided', () => {
                const config: Hash = {
                    output: './output',
                    content: {
                        maxInlineSvgSize: '4096',
                    },
                };

                const args: Hash = {
                    maxInlineSvgSize: {
                        defaultValue: 2048,
                        parseArg: (value: string) => parseInt(value, 10),
                    },
                };

                const result = combineProps(
                    config as BuildConfig,
                    'content',
                    ['maxInlineSvgSize'],
                    args,
                );

                expect(result).toEqual({
                    maxInlineSvgSize: 4096,
                });
            });

            it('should handle empty props array', () => {
                const config: Hash = {
                    output: './output',
                    content: {
                        maxInlineSvgSize: 1024,
                    },
                };

                const args: Hash = {};

                const result = combineProps(config as BuildConfig, 'content', [], args);

                expect(result).toEqual({});
            });

            it('should handle missing properties gracefully', () => {
                const config: Hash = {
                    output: './output',
                    content: {},
                };

                const args: Hash = {};

                const result = combineProps(
                    config as BuildConfig,
                    'content',
                    ['maxInlineSvgSize'],
                    args,
                );

                expect(result).toEqual({});
            });
        });

        describe('fileSizeConverter', () => {
            it('should convert bytes without unit', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('1024', '2048');

                expect(result).toBe(1024);
            });

            it('should convert kilobytes with K unit', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('512K', '2M');

                expect(result).toBe(524288); // 512 * 1024
            });

            it('should convert megabytes with M unit', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('3M', '2M');

                expect(result).toBe(3145728); // 3 * 1024 * 1024
            });

            it('should handle lowercase units', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('2m', '1M');

                expect(result).toBe(2097152); // 2 * 1024 * 1024
            });

            it('should handle lowercase kilobytes', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('256k', '1M');

                expect(result).toBe(262144); // 256 * 1024
            });

            it('should use default value when input is empty', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('', '4M');

                expect(result).toBe(4194304); // 4 * 1024 * 1024
            });

            it('should return number as is when input is already a number', () => {
                const converter = fileSizeConverter({});
                const result = converter(1024 as unknown as string, '2M');

                expect(result).toBe(1024);
            });

            it('should limit to max value when specified', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter('20M', '2M');

                expect(result).toBe(16777216); // 16 * 1024 * 1024
            });

            it('should return 0 value', () => {
                const converter = fileSizeConverter({max: '16M'});
                const result = converter(0 as unknown as string, '4M');

                expect(result).toBe(0); // 0
            });

            it('should use default value when disableIfZero is true and input is "0"', () => {
                const converter = fileSizeConverter({disableIfZero: true});
                const result = converter('0', '4M');

                expect(result).toBe(4194304); // 4 * 1024 * 1024 (default value)
            });

            it('should return 0 when disableIfZero is false and input is "0"', () => {
                const converter = fileSizeConverter({disableIfZero: false});
                const result = converter('0', '4M');

                expect(result).toBe(0); // 0
            });

            it('should return 0 when disableIfZero is not specified and input is "0"', () => {
                const converter = fileSizeConverter({});
                const result = converter('0', '4M');

                expect(result).toBe(0); // 0
            });

            it('should throw error for unknown unit type', () => {
                const converter = fileSizeConverter({});

                expect(() => converter('5G', '2M')).toThrow(
                    'Unknown unit type at config: G. Allowed: K, M, k, m or without unit',
                );
            });
        });
    });

    describe('originAsInput integration', () => {
        it('should use original input directory when originAsInput is true', async () => {
            const config = {
                input: '/test/input',
                output: '/test/output',
                originAsInput: true,
            } as BuildConfig;

            const run = new Run(config);

            expect(run.originalInput).toBe('/test/input');
            expect(run.input).toBe('/test/input'); // Should use original input directly
        });

        it('should use temporary input directory when originAsInput is false', async () => {
            const config = {
                input: '/test/input',
                output: '/test/output',
                originAsInput: false,
            } as BuildConfig;

            const run = new Run(config);

            expect(run.originalInput).toBe('/test/input');
            expect(run.input).toMatch(/\.tmp_input$/); // Should use temp directory in output
            expect(run.input).not.toBe(run.originalInput);
        });

        it('should use temporary input directory by default', async () => {
            const config = {
                input: '/test/input',
                output: '/test/output',
                // originAsInput not specified, should default to false
            } as BuildConfig;

            const run = new Run(config);

            expect(run.originalInput).toBe('/test/input');
            expect(run.input).toMatch(/\.tmp_input$/); // Should use temp directory by default
            expect(run.input).not.toBe(run.originalInput);
        });

        it('should correctly handle path resolution with originAsInput=true', async () => {
            const config = {
                input: '/test/input',
                output: '/test/output',
                originAsInput: true,
            } as BuildConfig;

            const run = new Run(config);

            // Verify that input and originalInput are the same when originAsInput is true
            expect(run.input).toBe(run.originalInput);
            expect(run.input).toBe('/test/input');
        });

        it('should correctly handle path resolution with originAsInput=false', async () => {
            const config = {
                input: '/test/input',
                output: '/test/output',
                originAsInput: false,
            } as BuildConfig;

            const run = new Run(config);

            // Verify that input is different from originalInput when originAsInput is false
            expect(run.input).not.toBe(run.originalInput);
            expect(run.input).toMatch(/\.tmp_input$/);
            expect(run.originalInput).toBe('/test/input');
        });

        describe('copyOnWrite integration', () => {
            it('should use COPYFILE_FICLONE flag when copyOnWrite is true', async () => {
                const config = {
                    input: '/test/input',
                    output: '/test/output',
                    copyOnWrite: true,
                } as BuildConfig;

                const run = new Run(config);

                // Mock the file system operations
                const statSpy = vi
                    .spyOn(run.fs, 'stat')
                    .mockResolvedValue({isFile: () => true} as any);
                const mkdirSpy = vi.spyOn(run.fs, 'mkdir').mockResolvedValue(undefined);
                const copyFileSpy = vi.spyOn(run.fs, 'copyFile').mockResolvedValue();

                await run.copy('/test/input/file.md', '/test/output/file.md');

                // Verify that COPYFILE_FICLONE flag was used
                expect(copyFileSpy).toHaveBeenCalledWith(
                    '/test/input/file.md',
                    '/test/output/file.md',
                    fsConstants.COPYFILE_FICLONE,
                );

                statSpy.mockRestore();
                mkdirSpy.mockRestore();
                copyFileSpy.mockRestore();
            });

            it('should not use COPYFILE_FICLONE flag when copyOnWrite is false', async () => {
                const config = {
                    input: '/test/input',
                    output: '/test/output',
                    copyOnWrite: false,
                } as BuildConfig;

                const run = new Run(config);

                // Mock the file system operations
                const statSpy = vi
                    .spyOn(run.fs, 'stat')
                    .mockResolvedValue({isFile: () => true} as any);
                const mkdirSpy = vi.spyOn(run.fs, 'mkdir').mockResolvedValue(undefined);
                const copyFileSpy = vi.spyOn(run.fs, 'copyFile').mockResolvedValue();

                await run.copy('/test/input/file.md', '/test/output/file.md');

                // Verify that no flags were used (0)
                expect(copyFileSpy).toHaveBeenCalledWith(
                    '/test/input/file.md',
                    '/test/output/file.md',
                    0,
                );

                statSpy.mockRestore();
                mkdirSpy.mockRestore();
                copyFileSpy.mockRestore();
            });

            it('should default to copyOnWrite=false when not specified in config object', async () => {
                const config = {
                    input: '/test/input',
                    output: '/test/output',
                    // copyOnWrite not specified, will be undefined
                } as BuildConfig;

                const run = new Run(config);

                // Mock the file system operations
                const statSpy = vi
                    .spyOn(run.fs, 'stat')
                    .mockResolvedValue({isFile: () => true} as any);
                const mkdirSpy = vi.spyOn(run.fs, 'mkdir').mockResolvedValue(undefined);
                const copyFileSpy = vi.spyOn(run.fs, 'copyFile').mockResolvedValue();

                await run.copy('/test/input/file.md', '/test/output/file.md');

                // When copyOnWrite is undefined in config object, it defaults to false (0)
                // because the default value is only applied during CLI argument parsing
                expect(copyFileSpy).toHaveBeenCalledWith(
                    '/test/input/file.md',
                    '/test/output/file.md',
                    0,
                );

                statSpy.mockRestore();
                mkdirSpy.mockRestore();
                copyFileSpy.mockRestore();
            });
        });
    });

    // describe('apply', () => {});
});
