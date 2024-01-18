import {describe, vi} from 'vitest';
import {testConfig as test} from '../../__tests__';

vi.mock('~/cmd/publish/upload');

describe('Build publish feature', () => {
    describe('config', () => {
        describe('publish', () => {
            test('should handle default', '', {
                publish: false,
            });

            test('should handle arg', '--publish', {
                publish: true,
            });

            test(
                'should handle config',
                '',
                {
                    publish: true,
                },
                {
                    publish: true,
                },
            );
        });
    });
});
