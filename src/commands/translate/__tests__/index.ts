import type {Mock} from 'vitest';
import type {TranslateConfig} from '..';

import {expect, it, vi} from 'vitest';
import {parse} from '~/commands/parser';
import {Translate} from '..';
import {Run} from '../run';
import {Extract} from '../commands/extract';

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

export async function runTranslate(argv: string) {
    const translate = new Translate();
    vi.spyOn(Run.prototype, 'prepareRun').mockImplementation(async () => undefined);
    const rawArgs = ['node', 'index'].concat(argv.split(' '));
    const args = parse(rawArgs, 'translate');

    await translate.init(args);
    await translate.parse(rawArgs);

    return translate;
}

export async function runTranslateExtract(argv: string) {
    const extract = new Extract();
    vi.spyOn(Run.prototype, 'prepareRun').mockImplementation(async () => undefined);
    const rawArgs = ['node', 'index'].concat(argv.split(' '));
    const args = parse(rawArgs, 'extract');

    await extract.init(args);
    await extract.parse(rawArgs);

    return extract;
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
