import {describe, vi} from 'vitest';
import {testConfig as test} from '../../__tests__';

vi.mock('~/cmd/publish/upload');

describe('Build linter feature', () => {
    describe('config', () => {
        describe('lintDisabled', () => {
            test('should handle default', '', {
                lint: {
                    enabled: true,
                    config: {
                        'log-levels': {
                            MD033: 'disabled',
                        },
                    }
                },
            });

            test('should handle arg', '--lint-disabled', {
                lint: {enabled: false}
            });

            test(
                'should handle config',
                '',
                {
                    lintDisabled: true,
                },
                {
                    lint: {enabled: false}
                },
            );

            test(
                'should handle enabled allowHtml',
                '',
                {
                    lintDisabled: false,
                    allowHtml: true,
                },
                {
                    lint: {
                        enabled: true,
                        config: {
                            'log-levels': {
                                MD033: 'disabled',
                            },
                        }
                    },
                },
            );

            test(
                'should handle disabled allowHtml',
                '',
                {
                    lintDisabled: false,
                    allowHtml: false,
                },
                {
                    lint: {
                        enabled: true,
                        config: {
                            'log-levels': {
                                MD033: 'error',
                            },
                        }
                    },
                },
            );
        });
    });
});
