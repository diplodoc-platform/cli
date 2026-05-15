import {describe} from 'vitest';

import {testConfig as test} from '../../__tests__';

describe('Build search feature', () => {
    describe('config', () => {
        describe('search', () => {
            test('should handle default', '', {
                search: {
                    enabled: false,
                    provider: 'local',
                },
            });

            test('should handle arg', '--search', {
                search: {
                    enabled: true,
                    provider: 'local',
                },
            });

            test(
                'should handle arg with priority',
                '--search',
                {
                    search: {
                        enabled: false,
                        provider: 'custom',
                    },
                },
                {
                    search: {
                        enabled: true,
                        provider: 'custom',
                    },
                },
            );

            test(
                'should handle config',
                '',
                {
                    search: {
                        enabled: true,
                        provider: 'custom',
                        searchUrl: 'test/?q={{query}}',
                    },
                },
                {
                    search: {
                        enabled: true,
                        provider: 'custom',
                        searchUrl: 'test/?q={{query}}',
                    },
                },
            );

            test(
                'should handle simplified config',
                '',
                {
                    search: true,
                },
                {
                    search: {
                        enabled: true,
                        provider: 'local',
                    },
                },
            );
        });
    });
});
