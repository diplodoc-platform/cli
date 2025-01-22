import type {Mock} from 'vitest';
import type {TranslateConfig} from '..';

import {expect, it, vi} from 'vitest';
import {Translate} from '..';

// eslint-disable-next-line no-var
var resolveConfig: Mock;

vi.mock('../providers/yandex/provider');
vi.mock('~/core/config', async (importOriginal) => {
    resolveConfig = vi.fn((_path, {defaults, fallback}) => {
        return defaults || fallback;
    });

    return {
        ...((await importOriginal()) as {}),
        resolveConfig,
    };
});

export async function runTranslate(args: string) {
    const translate = new Translate();

    translate.apply();

    await translate.parse(['node', 'index'].concat(args.split(' ')));

    return translate;
}

export function testConfig<Config = TranslateConfig>(defaultArgs: string) {
    function _testConfig(name: string, args: string, result: DeepPartial<Config>): void;
    function _testConfig(name: string, args: string, result: Error | string): void;
    function _testConfig(
        name: string,
        args: string,
        config: DeepPartial<Config>,
        result: DeepPartial<Config>,
    ): void;
    function _testConfig(
        name: string,
        args: string,
        config: DeepPartial<Config>,
        result: Error | string,
    ): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function _testConfig(name: string, args: string, config: any, result?: any): void {
        it(name, async () => {
            if (!result) {
                result = config;
                config = {};
            }

            resolveConfig.mockImplementation((_path, {defaults}) => {
                return {
                    ...defaults,
                    ...config,
                };
            });

            if (result instanceof Error || typeof result === 'string') {
                await expect(async () => runTranslate(defaultArgs + ' ' + args)).rejects.toThrow(
                    result,
                );
            } else {
                const instance = await runTranslate(defaultArgs + ' ' + args);

                expect(instance.provider?.translate).toBeCalledWith(
                    expect.anything(),
                    expect.objectContaining(result),
                );
            }
        });
    }

    return _testConfig;
}
