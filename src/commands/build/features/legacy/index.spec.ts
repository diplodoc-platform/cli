import {describe} from 'vitest';

import {testConfig as test} from '../../__tests__';

describe('Build legacy feature', () => {
    describe('config', () => {
        describe('disableLiquid', () => {
            test('should handle default', '', {
                template: {
                    enabled: true,
                },
            });

            test('should handle arg', '--disable-liquid', {
                template: {
                    enabled: false,
                },
            });

            test('should handle old arg with priority', '--disable-liquid --template all', {
                template: {
                    enabled: false,
                },
            });

            test(
                'should handle config',
                '',
                {
                    disableLiquid: true,
                },
                {
                    template: {
                        enabled: false,
                    },
                },
            );
        });

        describe('applyPresets', () => {
            test('should handle default', '', {
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
                    template: {
                        features: {
                            substitutions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-apply-presets', {
                template: {
                    features: {
                        substitutions: false,
                    },
                },
            });

            test('should handle new arg', '--no-template-vars', {
                template: {
                    features: {
                        substitutions: false,
                    },
                },
            });

            test('should handle old arg with priority', '--no-apply-presets --template-vars', {
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
                    applyPresets: false,
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

        describe('resolveConditions', () => {
            test('should handle default', '', {
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
                    template: {
                        features: {
                            conditions: true,
                        },
                    },
                },
            );

            test('should handle negated arg', '--no-resolve-conditions', {
                template: {
                    features: {
                        conditions: false,
                    },
                },
            });

            test('should handle new arg', '--no-template-conditions', {
                template: {
                    features: {
                        conditions: false,
                    },
                },
            });

            test(
                'should handle old arg with priority',
                '--no-resolve-conditions --template-conditions',
                {
                    template: {
                        features: {
                            conditions: false,
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
                template: {
                    scopes: {
                        text: true,
                        code: false,
                    },
                },
            });

            test('should handle arg', '--conditions-in-code', {
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
                    template: {
                        scopes: {
                            text: true,
                            code: false,
                        },
                    },
                },
            );

            test('should handle old arg with priority', '--no-conditions-in-code --template all', {
                template: {
                    scopes: {
                        text: true,
                        code: false,
                    },
                },
            });

            test('should handle negated new arg', '--no-template', {
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
                    template: {
                        scopes: {
                            text: true,
                            code: true,
                        },
                    },
                },
            );
        });

        describe('lintDisabled', () => {
            test('should handle default', '', {
                lint: {
                    enabled: true,
                    config: {
                        MD033: false,
                    },
                },
            });

            test('should handle arg', '--lint-disabled', {
                lint: {enabled: false},
            });

            test(
                'should handle config',
                '',
                {
                    lintDisabled: true,
                },
                {
                    lint: {enabled: false},
                },
            );
        });
    });
});
