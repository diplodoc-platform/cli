import {describe, expect, it} from 'vitest';
import {runBuild, setupBuild, testConfig as test} from '../../__tests__';
import {resolve} from 'node:path';
import {dedent} from 'ts-dedent';

describe('Build template feature', () => {
    describe('config', () => {
        describe('template', () => {
            test('should handle default', '', {
                template: {
                    enabled: true,
                    scopes: {
                        text: true,
                        code: false,
                    },
                },
            });

            test('should handle arg `all`', '--template all', {
                template: {
                    enabled: true,
                    scopes: {
                        text: true,
                        code: true,
                    },
                },
            });

            test('should handle arg `text`', '--template text', {
                template: {
                    enabled: true,
                    scopes: {
                        text: true,
                        code: false,
                    },
                },
            });

            test('should handle arg `code`', '--template code', {
                template: {
                    enabled: true,
                    scopes: {
                        text: false,
                        code: true,
                    },
                },
            });

            test('should handle negated arg', '--no-template', {
                template: {
                    enabled: false,
                    scopes: {
                        text: false,
                        code: false,
                    },
                    features: {
                        conditions: false,
                        substitutions: false,
                    },
                },
            });

            test(
                'should handle config',
                '',
                {
                    template: {
                        enabled: false,
                    },
                },
                {
                    template: {
                        enabled: false,
                        scopes: {
                            text: true,
                            code: false,
                        },
                    },
                },
            );

            test(
                'should handle siplified config',
                '',
                {
                    template: false,
                },
                {
                    template: {
                        enabled: false,
                        scopes: {
                            text: true,
                            code: false,
                        },
                    },
                },
            );
        });

        describe('templateVars', () => {
            test('should handle default', '', {
                template: {
                    features: {
                        substitutions: true,
                    },
                },
            });

            test(
                'should handle arg with priority',
                '--template-vars',
                {
                    template: {
                        features: {
                            substitutions: false,
                        },
                    },
                },
                {
                    template: {
                        features: {
                            substitutions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-template-vars', {
                template: {
                    features: {
                        substitutions: false,
                    },
                },
            });

            test(
                'should handle config',
                '',
                {
                    template: {
                        features: {
                            substitutions: false,
                        },
                    },
                },
                {
                    template: {
                        features: {
                            substitutions: false,
                        },
                    },
                },
            );
        });

        describe('templateConditions', () => {
            test('should handle default', '', {
                template: {
                    features: {
                        conditions: true,
                    },
                },
            });

            test(
                'should handle arg with priority',
                '--template-conditions',
                {
                    template: {
                        features: {
                            conditions: false,
                        },
                    },
                },
                {
                    template: {
                        features: {
                            conditions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-template-conditions', {
                template: {
                    features: {
                        conditions: false,
                    },
                },
            });

            test(
                'should handle config',
                '',
                {
                    template: {
                        features: {
                            conditions: false,
                        },
                    },
                },
                {
                    template: {
                        features: {
                            conditions: false,
                        },
                    },
                },
            );
        });
    });

    describe('run', () => {
        const args = (...args: string[]) =>
            '-i /dev/null/input -o /dev/null/output ' + args.join(' ');

        it('should not save presets.yaml for html build', async () => {
            const build = setupBuild({
                globs: {
                    '**/presets.yaml': ['presets.yaml'] as NormalizedPath[],
                },
                files: {
                    './presets.yaml': dedent`
                        default:
                          field: value
                    `,
                },
            });

            await runBuild(args('-f', 'html', '--no-template'), build);

            expect(build.run.write).not.toHaveBeenCalledWith(
                resolve('/dev/null/output/.tmp_output/presets.yaml'),
                `default:\n  field: value\n`,
            );
        });

        it('should save presets.yaml for md build with disabled templating', async () => {
            const build = setupBuild({
                globs: {
                    '**/presets.yaml': ['presets.yaml'] as NormalizedPath[],
                },
                files: {
                    './presets.yaml': dedent`
                        default:
                          field: value
                    `,
                },
            });

            await runBuild(args('-f', 'md', '--no-template'), build);

            expect(build.run.write).toHaveBeenCalledWith(
                resolve('/dev/null/output/.tmp_output/presets.yaml'),
                `default:\n  field: value\n`,
            );
        });

        it('should filter presets.yaml for md build with disabled templating', async () => {
            const build = setupBuild({
                globs: {
                    '**/presets.yaml': ['presets.yaml'] as NormalizedPath[],
                },
                files: {
                    './presets.yaml': dedent`
                        default:
                          field: value
                        internal:
                          field: value
                        external:
                          field: value
                    `,
                },
            });

            await runBuild(args('-f', 'md', '--no-template', '--vars-preset', 'internal'), build);

            expect(build.run.write).toHaveBeenCalledWith(
                resolve('/dev/null/output/.tmp_output/presets.yaml'),
                `default:\n  field: value\ninternal:\n  field: value\n`,
            );
        });
    });
});
