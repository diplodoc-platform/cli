import {describe} from 'vitest';
import {testConfig as test} from '../../__tests__';

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
