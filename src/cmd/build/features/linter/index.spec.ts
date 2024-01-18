import {describe, vi} from 'vitest';
import {testConfig as test} from '../../__tests__';

vi.mock('~/cmd/publish/upload');

describe('Build linter feature', () => {
    describe('config', () => {
        describe('lintDisabled', () => {
            test('should handle default', '', {
                lintDisabled: false,
                lintConfig: {
                    'log-levels': {
                        MD033: 'disabled',
                    },
                },
            });

            test('should handle arg', '--lint-disabled', {
                lintDisabled: true,
            });

            test(
                'should handle config',
                '',
                {
                    lintDisabled: true,
                },
                {
                    lintDisabled: true,
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
                    lintDisabled: false,
                    lintConfig: {
                        'log-levels': {
                            MD033: 'disabled',
                        },
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
                    lintDisabled: false,
                    lintConfig: {
                        'log-levels': {
                            MD033: 'error',
                        },
                    },
                },
            );
        });
    });
});
