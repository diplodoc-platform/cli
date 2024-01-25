import type {YandexTranslationConfig} from './providers/yandex';
import {describe, expect, it} from 'vitest';
import {runTranslate as run, testConfig} from './__tests__';

describe('Translate command', () => {
    describe('config', () => {
        describe('provider', () => {
            const test = testConfig('-i input -o output --folder-id 1 --oauth-token token');

            test(
                'should fail on unknown provider',
                '--provider unknown --folder-id 1',
                `error: option '--provider <value>' argument 'unknown' is invalid. Allowed choices are yandex.`,
            );

            test('should handle default', '--folder-id 1', {
                provider: 'yandex',
            });
        });

        describe('yandex provider', () => {
            describe('folderId', () => {
                const test = testConfig<YandexTranslationConfig>(
                    '-i input -o output --oauth-token token',
                );

                test('should handle arg', '--folder-id 1', {
                    folderId: '1',
                });

                test(
                    'should handle config',
                    '',
                    {
                        folderId: '1',
                    },
                    {
                        folderId: '1',
                    },
                );

                test(
                    'should handle arg with priority',
                    '--folder-id 1',
                    {
                        folderId: '2',
                    },
                    {
                        folderId: '1',
                    },
                );
            });
        });
    });

    it('should call provider translate with config', async () => {
        const instance = await run('-o output --folder-id 1');

        expect(instance.provider?.translate).toBeCalledWith(expect.objectContaining({}));
    });
});
