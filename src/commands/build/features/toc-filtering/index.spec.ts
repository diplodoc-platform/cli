import {describe} from 'vitest';

import {testConfig as test} from '../../__tests__';

describe('Build toc-filtering feature', () => {
    describe('config', () => {
        describe('removeHiddenTocItems', () => {
            test('should handle default', '', {
                removeHiddenTocItems: false,
            });

            test('should handle arg', '--remove-hidden-toc-items', {
                removeHiddenTocItems: true,
            });

            test(
                'should handle config enabled',
                '',
                {
                    removeHiddenTocItems: true,
                },
                {
                    removeHiddenTocItems: true,
                },
            );

            test(
                'should handle config disabled',
                '',
                {
                    removeHiddenTocItems: false,
                },
                {
                    removeHiddenTocItems: false,
                },
            );
        });

        describe('removeEmptyTocItems', () => {
            test('should handle default', '', {
                removeEmptyTocItems: false,
            });

            test('should handle arg', '--remove-empty-toc-items', {
                removeEmptyTocItems: true,
            });

            test(
                'should handle config enabled',
                '',
                {
                    removeEmptyTocItems: true,
                },
                {
                    removeEmptyTocItems: true,
                },
            );

            test(
                'should handle config disabled',
                '',
                {
                    removeEmptyTocItems: false,
                },
                {
                    removeEmptyTocItems: false,
                },
            );
        });
    });
});
