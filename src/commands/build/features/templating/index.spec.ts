import {describe} from 'vitest';
import {testConfig as test} from '../../__tests__';

describe('Build template feature', () => {
    describe('config', () => {
        describe('disableLiquid', () => {
            test('should handle default', '', {
                disableLiquid: false,
                template: {
                    enabled: true,
                },
            });

            test('should handle arg', '--disable-liquid', {
                disableLiquid: true,
                template: {
                    enabled: false,
                },
            });

            test('should handle new arg', '--no-template', {
                disableLiquid: true,
                template: {
                    enabled: false,
                },
            });

            test('should handle new arg with priority', '--disable-liquid --template all', {
                disableLiquid: false,
                template: {
                    enabled: true,
                },
            });

            test(
                'should handle config',
                '',
                {
                    disableLiquid: true,
                },
                {
                    disableLiquid: true,
                    template: {
                        enabled: false,
                    },
                },
            );
        });

        describe('applyPresets', () => {
            test('should handle default', '', {
                applyPresets: true,
                template: {
                    features: {
                        substitutions: true,
                    },
                },
            });

            test(
                'should handle arg with priority',
                '--apply-presets',
                {
                    applyPresets: false,
                },
                {
                    applyPresets: true,
                    template: {
                        features: {
                            substitutions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-apply-presets', {
                applyPresets: false,
                template: {
                    features: {
                        substitutions: false,
                    },
                },
            });

            test('should handle new arg', '--no-template-vars', {
                applyPresets: false,
                template: {
                    features: {
                        substitutions: false,
                    },
                },
            });

            test('should handle new arg with priority', '--no-apply-presets --template-vars', {
                applyPresets: true,
                template: {
                    features: {
                        substitutions: true,
                    },
                },
            });

            test(
                'should handle config',
                '',
                {
                    applyPresets: false,
                },
                {
                    applyPresets: false,
                    template: {
                        features: {
                            substitutions: false,
                        },
                    },
                },
            );
        });

        describe('resolveConditions', () => {
            test('should handle default', '', {
                resolveConditions: true,
                template: {
                    features: {
                        conditions: true,
                    },
                },
            });

            test(
                'should handle arg with priority',
                '--resolve-conditions',
                {
                    resolveConditions: false,
                },
                {
                    resolveConditions: true,
                    template: {
                        features: {
                            conditions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-resolve-conditions', {
                resolveConditions: false,
                template: {
                    features: {
                        conditions: false,
                    },
                },
            });

            test('should handle new arg', '--no-template-conditions', {
                resolveConditions: false,
                template: {
                    features: {
                        conditions: false,
                    },
                },
            });

            test(
                'should handle new arg with priority',
                '--no-resolve-conditions --template-conditions',
                {
                    resolveConditions: true,
                    template: {
                        features: {
                            conditions: true,
                        },
                    },
                },
            );

            test(
                'should handle config',
                '',
                {
                    resolveConditions: false,
                },
                {
                    resolveConditions: false,
                    template: {
                        features: {
                            conditions: false,
                        },
                    },
                },
            );
        });

        describe('conditionsInCode', () => {
            test('should handle default', '', {
                conditionsInCode: false,
                template: {
                    scopes: {
                        text: true,
                        code: false,
                    },
                },
            });

            test('should handle arg', '--conditions-in-code', {
                conditionsInCode: true,
                template: {
                    scopes: {
                        text: true,
                        code: true,
                    },
                },
            });

            test(
                'should handle negated arg with priority',
                '--no-conditions-in-code',
                {
                    conditionsInCode: true,
                },
                {
                    conditionsInCode: false,
                    template: {
                        scopes: {
                            text: true,
                            code: false,
                        },
                    },
                },
            );

            test('should handle new arg with priority', '--no-conditions-in-code --template all', {
                conditionsInCode: true,
                template: {
                    scopes: {
                        text: true,
                        code: true,
                    },
                },
            });

            test('should handle negated new arg', '--no-template', {
                conditionsInCode: false,
                template: {
                    enabled: false,
                    scopes: {
                        text: false,
                        code: false,
                    },
                },
            });

            test(
                'should handle config',
                '',
                {
                    conditionsInCode: true,
                },
                {
                    conditionsInCode: true,
                    template: {
                        scopes: {
                            text: true,
                            code: true,
                        },
                    },
                },
            );
        });

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

            test('should handle arg `text`', '--template code', {
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
});
