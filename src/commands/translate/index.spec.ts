import type {YandexTranslationConfig} from './providers/yandex';
import {describe, expect, it, vi} from 'vitest';
import {runTranslate as run, runTranslateExtract as runExtract, testConfig} from './__tests__';

describe('Translate command', () => {
    describe('config', () => {
        describe('provider', () => {
            const test = testConfig('--source ru --target en --folder 1 --auth t1.a');

            test(
                'should fail on unknown provider',
                '--provider unknown --folder 1',
                `error: option '--provider <value>' argument 'unknown' is invalid. Allowed choices are yandex.`,
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
});
