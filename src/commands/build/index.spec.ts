import {describe, expect, it} from 'vitest';
import {handler, runBuild as run, testConfig as test} from './__tests__';

describe('Build command', () => {
    describe('config', () => {
        it('should fail without required input prop', async () => {
            expect(() => run('')).rejects.toThrow(
                `error: required option '-i, --input <string>' not specified`,
            );
        });

        it('should fail without required output prop', async () => {
            expect(() => run('--input ./input')).rejects.toThrow(
                `error: required option '-o, --output <string>' not specified`,
            );
        });

        it('should handle required props in args', async () => {
            await run('--input ./input --output ./output');

            expect(handler).toBeCalled();
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
                expect(() =>
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

        describe('addMapFile', () => {
            test('should handle default', '', {
                addMapFile: false,
            });

            test('should handle arg', '--add-map-file', {
                addMapFile: true,
            });

            test(
                'should handle config',
                '',
                {
                    addMapFile: true,
                },
                {
                    addMapFile: true,
                },
            );
        });

        describe('removeHiddenTocItems', () => {
            test('should handle default', '', {
                removeHiddenTocItems: false,
            });

            test('should handle arg', '--remove-hidden-toc-items', {
                removeHiddenTocItems: true,
            });

            test(
                'should handle config',
                '',
                {
                    removeHiddenTocItems: true,
                },
                {
                    removeHiddenTocItems: true,
                },
            );
        });

        describe('allowCustomResources', () => {
            test('should handle default', '', {
                allowCustomResources: false,
            });

            test('should handle arg', '--allow-custom-resources', {
                allowCustomResources: true,
            });

            test(
                'should handle config',
                '',
                {
                    allowCustomResources: true,
                },
                {
                    allowCustomResources: true,
                },
            );
        });

        describe('staticContent', () => {
            test('should handle default', '', {
                staticContent: false,
            });

            test('should handle arg', '--static-content', {
                staticContent: true,
            });

            test(
                'should handle config',
                '',
                {
                    staticContent: true,
                },
                {
                    staticContent: true,
                },
            );
        });

        describe('addSystemMeta', () => {
            test('should handle default', '', {
                addSystemMeta: false,
            });

            test('should handle arg', '--add-system-meta', {
                addSystemMeta: true,
            });

            test(
                'should handle config',
                '',
                {
                    addSystemMeta: true,
                },
                {
                    addSystemMeta: true,
                },
            );
        });

        describe('ignoreStage', () => {
            test('should handle default', '', {
                ignoreStage: 'skip',
            });

            test('should handle arg', '--ignore-stage preview', {
                ignoreStage: 'preview',
            });

            test(
                'should handle config',
                '',
                {
                    ignoreStage: 'preview',
                },
                {
                    ignoreStage: 'preview',
                },
            );
        });

        describe('hidden', () => {
            test('should handle default', '', {
                hidden: [],
            });

            test('should handle arg', '--hidden **/*.md', {
                hidden: ['**/*.md'],
            });

            test('should handle args', '--hidden **/*.md --hidden **/*.yaml', {
                hidden: ['**/*.md', '**/*.yaml'],
            });

            test(
                'should handle config',
                '',
                {
                    hidden: ['**/*.md'],
                },
                {
                    hidden: ['**/*.md'],
                },
            );

            // TODO: should merge args ang config
            // test('should merge args ang config')
        });

        describe('buildDisabled', () => {
            test('should handle default', '', {
                buildDisabled: false,
            });

            test('should handle arg', '--build-disabled', {
                buildDisabled: true,
            });

            test(
                'should handle config',
                '',
                {
                    buildDisabled: true,
                },
                {
                    buildDisabled: true,
                },
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

    // describe('apply', () => {});
});
