import type {BuildConfig} from '.';

import {describe, expect, it} from 'vitest';

import {combineProps, fileSizeConverter} from './config';
import {
    handler,
    runBuild as run,
    testConfig as test,
    testBooleanFlag,
    testNestedBooleanFlag,
} from './__tests__';

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
        });

        describe('vcs', () => {
            test('should handle default', '', {
                vcs: {enabled: false},
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
                    transparentMode: false,
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

            test('should handle arg transparentMode', '--transparent-mode', {
                preprocess: {
                    transparentMode: true,
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
                'should handle transparentMode=false',
                '',
                {
                    preprocess: {
                        transparentMode: false,
                    },
                },
                {
                    preprocess: {
                        transparentMode: false,
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

            it('should throw error for unknown unit type', () => {
                const converter = fileSizeConverter({});

                expect(() => converter('5G', '2M')).toThrow(
                    'Unknown unit type at config: G. Allowed: K, M, k, m or without unit',
                );
            });
        });
    });

    // describe('apply', () => {});
});
