import {describe} from 'vitest';
import {testConfig as test} from '../../__tests__';

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
});
