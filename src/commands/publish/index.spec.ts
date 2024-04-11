import {describe, expect, it} from 'vitest';
import {runPublish as run, testConfig as test} from './__tests__';

describe('Publish command', () => {
    describe('config', () => {
        describe('bucket', () => {
            it('should fail without specified bucket', async () => {
                await expect(() => run('--access-key-id 1 --secret-access-key 1')).rejects.toThrow(
                    'Required `bucket` prop is not specified',
                );
            });

            test('should handle arg', '--bucket a', {
                bucket: 'a',
            });

            test(
                'should handle config',
                '',
                {
                    bucket: 'a',
                },
                {
                    bucket: 'a',
                },
            );
        });

        describe('endpoint', () => {
            it('should fail without specified endpoint', async () => {
                await expect(() =>
                    run('--bucket 1 --access-key-id 1 --secret-access-key 1 --endpoint '),
                ).rejects.toThrow('Required `endpoint` prop is not specified');
            });

            test(
                'should handle default',
                '',
                {
                    bucket: 'a',
                },
                {
                    endpoint: 'https://s3.amazonaws.com',
                },
            );

            test(
                'should handle arg',
                '--endpoint https://storage.yandexcloud.net',
                {
                    bucket: 'a',
                },
                {
                    endpoint: 'https://storage.yandexcloud.net',
                },
            );

            test(
                'should handle config',
                '',
                {
                    bucket: 'a',
                    endpoint: 'https://storage.yandexcloud.net',
                },
                {
                    endpoint: 'https://storage.yandexcloud.net',
                },
            );
        });

        describe('prefix', () => {
            test(
                'should handle default',
                '',
                {
                    bucket: 'a',
                },
                {
                    prefix: '',
                },
            );

            test(
                'should handle arg',
                '--prefix test',
                {
                    bucket: 'a',
                },
                {
                    prefix: 'test',
                },
            );

            test(
                'should handle config',
                '',
                {
                    bucket: 'a',
                    prefix: 'test',
                },
                {
                    prefix: 'test',
                },
            );
        });

        describe('region', () => {
            test(
                'should handle default',
                '',
                {
                    bucket: 'a',
                },
                {
                    region: 'eu-central-1',
                },
            );

            test(
                'should handle arg',
                '--region ru-central1',
                {
                    bucket: 'a',
                },
                {
                    region: 'ru-central1',
                },
            );

            test(
                'should handle config',
                '',
                {
                    bucket: 'a',
                    region: 'ru-central1',
                },
                {
                    region: 'ru-central1',
                },
            );
        });

        describe('accessKeyId', () => {
            it('should fail without required access-key-id prop', async () => {
                await expect(() => run('--secret-access-key 1')).rejects.toThrow(
                    `error: required option '--access-key-id <value>' not specified`,
                );
            });

            test(
                'should fail if access key stored in config',
                '',
                {
                    bucket: 'a',
                    accessKeyId: '1',
                },
                'Do not store `accessKeyId` in public config',
            );

            test(
                'should handle arg',
                '--access-key-id 1',
                {
                    bucket: 'a',
                },
                {
                    accessKeyId: '1',
                },
            );
        });

        describe('secretAccessKey', () => {
            it('should fail without required access-key-id prop', async () => {
                await expect(() => run('--access-key-id 1')).rejects.toThrow(
                    `error: required option '--secret-access-key <value>' not specified`,
                );
            });

            test(
                'should fail if secret key stored in config',
                '--secret-access-key 1',
                {
                    bucket: 'a',
                    secretAccessKey: '123',
                },
                'Do not store `secretAccessKey` in public config',
            );

            test(
                'should handle arg',
                '--secret-access-key 1',
                {
                    bucket: 'a',
                },
                {
                    secretAccessKey: '1',
                },
            );
        });
    });
});
