import {describe, expect, it} from 'vitest';
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
                    enabled: true,
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

        testBooleanFlag('addMapFile', '--add-map-file', false);
        testBooleanFlag('removeHiddenTocItems', '--remove-hidden-toc-items', false);
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

    // describe('apply', () => {});
});
