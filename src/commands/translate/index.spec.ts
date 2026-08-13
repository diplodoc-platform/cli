import type {YandexTranslationConfig} from './providers/yandex';
import type {AITranslationConfig} from './providers/ai';

import {describe, expect, it, vi} from 'vitest';

import {runTranslate as run, runTranslateExtract as runExtract, testConfig} from './__tests__';

describe('Translate command', () => {
    describe('config', () => {
        describe('provider', () => {
            const test = testConfig('--source ru --target en --folder 1 --auth t1.a');

            test(
                'should fail on unknown provider',
                '--provider unknown --folder 1',
                `error: option '--provider <value>' argument 'unknown' is invalid. Allowed choices are yandex, yandexgpt, openai, openrouter, anthropic.`,
            );

            test('should handle default', '--folder 1', {
                provider: 'yandex',
            });
        });

        describe('source', () => {
            const test = testConfig('--target ru --folder 1 --auth t1.a');

            test('should handle partial arg', '--source ru', {
                source: {
                    language: 'ru',
                    locale: '',
                },
            });

            test('should handle full arg', '--source ru-RU', {
                source: {
                    language: 'ru',
                    locale: 'RU',
                },
            });

            test(
                'should handle partial string config',
                '',
                {
                    // @ts-ignore
                    source: 'ru',
                },
                {
                    source: {
                        language: 'ru',
                        locale: '',
                    },
                },
            );

            test(
                'should handle full string config',
                '',
                {
                    // @ts-ignore
                    source: 'ru-RU',
                },
                {
                    source: {
                        language: 'ru',
                        locale: 'RU',
                    },
                },
            );

            test(
                'should handle partial object config',
                '',
                {
                    source: {
                        language: 'ru',
                    },
                },
                {
                    source: {
                        language: 'ru',
                        locale: '',
                    },
                },
            );

            test(
                'should handle full object config',
                '',
                {
                    source: {
                        language: 'ru',
                        locale: 'RU',
                    },
                },
                {
                    source: {
                        language: 'ru',
                        locale: 'RU',
                    },
                },
            );

            test(
                'should handle args with priority',
                '--source ru',
                {
                    // @ts-ignore
                    source: 'en-US',
                },
                {
                    source: {
                        language: 'ru',
                        locale: '',
                    },
                },
            );

            test(
                'should fail on wrong type',
                '',
                {
                    // @ts-ignore
                    source: [
                        {
                            language: 'ru',
                            locale: 'RU',
                        },
                    ],
                },
                `Field 'source' should be string or locale.`,
            );
        });

        describe('target', () => {
            const test = testConfig('--source ru --folder 1 --auth t1.a');

            test('should handle partial arg', '--target ru', {
                target: [
                    {
                        language: 'ru',
                        locale: '',
                    },
                ],
            });

            test('should handle full arg', '--target ru-RU', {
                target: [
                    {
                        language: 'ru',
                        locale: 'RU',
                    },
                ],
            });

            test('should handle multi arg', '--target ru-RU --target en-US', {
                target: [
                    {
                        language: 'ru',
                        locale: 'RU',
                    },
                    {
                        language: 'en',
                        locale: 'US',
                    },
                ],
            });

            test(
                'should handle partial string config',
                '',
                {
                    // @ts-ignore
                    target: 'ru',
                },
                {
                    target: [
                        {
                            language: 'ru',
                            locale: '',
                        },
                    ],
                },
            );

            test(
                'should handle full string config',
                '',
                {
                    // @ts-ignore
                    target: 'ru-RU',
                },
                {
                    target: [
                        {
                            language: 'ru',
                            locale: 'RU',
                        },
                    ],
                },
            );

            test(
                'should handle partial object config',
                '',
                {
                    target: {
                        // @ts-ignore
                        language: 'ru',
                    },
                },
                {
                    target: [
                        {
                            language: 'ru',
                            locale: '',
                        },
                    ],
                },
            );

            test(
                'should handle full object config',
                '',
                {
                    target: {
                        // @ts-ignore
                        language: 'ru',
                        locale: 'RU',
                    },
                },
                {
                    target: [
                        {
                            language: 'ru',
                            locale: 'RU',
                        },
                    ],
                },
            );

            test(
                'should handle multi object config',
                '',
                {
                    target: [
                        {
                            language: 'ru',
                            locale: 'RU',
                        },
                        {
                            language: 'en',
                            locale: 'US',
                        },
                    ],
                },
                {
                    target: [
                        {
                            language: 'ru',
                            locale: 'RU',
                        },
                        {
                            language: 'en',
                            locale: 'US',
                        },
                    ],
                },
            );

            test(
                'should fail on wrong type',
                '',
                {
                    // @ts-ignore
                    target: 1,
                },
                `Field 'target' should be string, locale or array.`,
            );
        });

        describe('copyAssets', () => {
            const test = testConfig('--source ru --target en --folder 1 --auth t1.a');

            test('should be disabled by default', '', {
                copyAssets: false,
            });

            test('should handle arg', '--copy-assets', {
                copyAssets: true,
            });

            test(
                'should handle config',
                '',
                {
                    copyAssets: true,
                },
                {
                    copyAssets: true,
                },
            );
        });

        describe('timeout', () => {
            const test = testConfig('--source ru --target en --folder 1 --auth t1.a');

            test('should use default value', '', {
                timeout: 5000,
            });

            test('should handle arg', '--timeout 30000', {
                timeout: 30000,
            });

            test(
                'should handle config',
                '',
                {
                    timeout: 15000,
                },
                {
                    timeout: 15000,
                },
            );

            test(
                'should handle arg with priority over config',
                '--timeout 30000',
                {
                    timeout: 15000,
                },
                {
                    timeout: 30000,
                },
            );
        });

        describe('ai providers', () => {
            describe('openai', () => {
                const test = testConfig<AITranslationConfig>(
                    '--source ru --target en --provider openai --auth sk-test',
                );

                test('should handle defaults', '', {
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    promptMode: 'append',
                    temperature: 0,
                    maxOutputTokens: 4000,
                    maxBatchTokens: 2000,
                    maxConcurrency: 5,
                    retry: 3,
                    timeout: 60000,
                    apiHeaders: {},
                });

                test(
                    'should handle config values with priority over defaults',
                    '',
                    {
                        temperature: 0.3,
                        maxBatchTokens: 1000,
                        promptMode: 'replace',
                        timeout: 120000,
                    },
                    {
                        temperature: 0.3,
                        maxBatchTokens: 1000,
                        promptMode: 'replace',
                        timeout: 120000,
                    },
                );

                test(
                    'should handle args with priority over config',
                    '--temperature 0.7 --max-batch-tokens 500',
                    {
                        temperature: 0.3,
                        maxBatchTokens: 1000,
                    },
                    {
                        temperature: 0.7,
                        maxBatchTokens: 500,
                    },
                );

                test('should handle api base arg', '--api-base https://llm.internal/v1', {
                    apiBase: 'https://llm.internal/v1',
                });

                test(
                    'should handle api base from config',
                    '',
                    {
                        apiBase: 'https://llm.internal/v1',
                    },
                    {
                        apiBase: 'https://llm.internal/v1',
                    },
                );

                test('should parse api headers arg', '--api-header X-Org:team', {
                    apiHeaders: {'X-Org': 'team'},
                });

                test(
                    'should handle api headers object from config',
                    '',
                    {
                        // @ts-ignore
                        apiHeaders: {'X-Org': 'team'},
                    },
                    {
                        apiHeaders: {'X-Org': 'team'},
                    },
                );

                test('should clamp max concurrency to at least 1', '--max-concurrency 0', {
                    maxConcurrency: 1,
                });

                test('should disable judge by default', '', {
                    judge: false,
                    judgeThreshold: 70,
                });

                test('should handle judge args', '--judge --judge-threshold 80', {
                    judge: true,
                    judgeThreshold: 80,
                });

                test('should resolve cache dir arg', '--cache-dir .translate-cache', {
                    // @ts-ignore - asymmetric matcher in expected config
                    cacheDir: expect.stringContaining('.translate-cache'),
                });

                test('should handle no-cache arg', '--cache-dir .translate-cache --no-cache', {
                    cacheDir: undefined,
                });

                describe('auth via api headers', () => {
                    const test = testConfig<AITranslationConfig>(
                        '--source ru --target en --provider openai',
                    );

                    test(
                        'should not require auth when Authorization header is supplied',
                        '--api-header Authorization:OAuth-token',
                        {
                            auth: undefined,
                            apiHeaders: {Authorization: 'OAuth-token'},
                        },
                    );

                    it('should fail without auth and without auth header', async () => {
                        vi.stubEnv('OPENAI_API_KEY', '');
                        try {
                            const instance = await run(
                                '-o output --source ru --target en --provider openai --api-header X-Org:team',
                            );
                            expect(instance.report.code).toBe(1);
                        } finally {
                            vi.unstubAllEnvs();
                        }
                    });
                });
            });

            describe('yandexgpt', () => {
                const test = testConfig<AITranslationConfig>(
                    '--source ru --target en --provider yandexgpt --auth y0_test',
                );

                it('should require folder for short model name', async () => {
                    const instance = await run(
                        '-o output --source ru --target en --provider yandexgpt --auth y0_test',
                    );

                    expect(instance.report.code).toBe(1);
                    expect(instance.provider?.translate).not.toBeCalled();
                });

                test(
                    'should allow qualified model uri without folder',
                    '--model gpt://b1g/yandexgpt/latest',
                    {
                        model: 'gpt://b1g/yandexgpt/latest',
                    },
                );

                test('should handle folder with short model name', '--folder b1g', {
                    folder: 'b1g',
                    model: 'yandexgpt-lite',
                });
            });
        });

        describe('yandex provider', () => {
            describe('folder', () => {
                const test = testConfig<YandexTranslationConfig>(
                    '--source ru --target en --auth t1.a',
                );

                test('should handle arg', '--folder 1', {
                    folder: '1',
                });

                test(
                    'should handle config',
                    '',
                    {
                        folder: '1',
                    },
                    {
                        folder: '1',
                    },
                );

                test(
                    'should handle arg with priority',
                    '--folder 1',
                    {
                        folder: '2',
                    },
                    {
                        folder: '1',
                    },
                );
            });
        });
    });

    it('should call provider translate with config', async () => {
        const instance = await run('-o output --folder 1 --source ru --target en --auth y0_1');

        expect(instance.provider?.translate).toBeCalledWith(
            expect.anything(),
            expect.objectContaining({
                input: expect.stringMatching(/^(\/|[A-Z]:\\).*?/),
                output: expect.stringMatching(/^(\/|[A-Z]:\\).*?/),
            }),
        );
    });

    it('should register OpenAPI includer during initialization', async () => {
        const {Extension} = await import('./extract-openapi');

        vi.restoreAllMocks();

        const extensionSpy = vi.spyOn(Extension.prototype, 'apply');

        const translate = await run('-o output --folder 1 --source ru --target en --auth y0_1');

        // @ts-ignore - accessing protected property for testing
        const modules = translate.modules;
        const hasOpenApiIncluder = modules.some((module) => module instanceof Extension);

        expect(hasOpenApiIncluder).toBe(true);

        expect(extensionSpy).toHaveBeenCalled();
    });

    it('should call translate extract with option --filter', async () => {
        const instance = await runExtract('-o output --source ru --target en --filter');

        expect(instance.config).toEqual(
            expect.objectContaining({
                filter: true,
            }),
        );
    });

    it('should call translate extract without option --filter', async () => {
        const instance = await runExtract('-o output --source ru --target en');

        expect(instance.config).toEqual(
            expect.objectContaining({
                filter: false,
            }),
        );
    });

    it('should call translate extract with option --no-ref-resolve', async () => {
        const instance = await runExtract('-o output --source ru --target en --no-ref-resolve');

        expect(instance.config).toEqual(
            expect.objectContaining({
                refResolve: false,
            }),
        );
    });

    it('should call translate extract without option --no-ref-resolve', async () => {
        const instance = await runExtract('-o output --source ru --target en');

        expect(instance.config).toEqual(
            expect.objectContaining({
                refResolve: true,
            }),
        );
    });
});
