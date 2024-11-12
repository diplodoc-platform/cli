import {describe, vi} from 'vitest';
import {testConfig as test} from '../../__tests__';

vi.mock('~/cmd/publish/upload');

describe('Build linter feature', () => {
    describe('config', () => {
        describe('lint', () => {
            test('should handle default', '', {
                lint: {
                    enabled: true,
                    config: {
                        'log-levels': {
                            MD033: 'disabled',
                        },
                    },
                },
            });

            test('should handle arg', '--no-lint', {
                lint: {enabled: false},
            });

            test(
                'should handle config',
                '',
                {
                    lint: {enabled: false},
                },
                {
                    lint: {enabled: false},
                },
            );

            test(
                'should handle simplified config',
                '',
                {
                    lint: false,
                },
                {
                    lint: {enabled: false},
                },
            );

            test(
                'should handle enabled allowHtml',
                '',
                {
                    allowHtml: true,
                },
                {
                    lint: {
                        enabled: true,
                        config: {
                            'log-levels': {
                                MD033: 'disabled',
                            },
                        },
                    },
                },
            );

            test(
                'should handle disabled allowHtml',
                '',
                {
                    allowHtml: false,
                },
                {
                    lint: {
                        enabled: true,
                        config: {
                            'log-levels': {
                                MD033: 'error',
                            },
                        },
                    },
                },
            );
        });
    });
});
