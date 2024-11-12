import type {Run} from '../run';
import type {BuildConfig, BuildRawConfig} from '..';

import {Mock, describe, expect, it, vi} from 'vitest';
import {Build} from '..';
import {handler as originalHandler} from '../handler';
import {withConfigUtils} from '~/config';

export const handler = originalHandler as Mock;

// eslint-disable-next-line no-var
var resolveConfig: Mock;

vi.mock('shelljs');
vi.mock('../handler');
vi.mock('~/config', async (importOriginal) => {
    resolveConfig = vi.fn((_path, {defaults, fallback}) => {
        return defaults || fallback;
    });

    return {
        ...((await importOriginal()) as {}),
        resolveConfig,
    };
});

export async function runBuild(args: string) {
    const build = new Build();

    build.apply();

    await build.parse(['node', 'index'].concat(args.split(' ')));
}

export function testConfig(name: string, args: string, result: DeepPartial<BuildConfig>): void;
export function testConfig(name: string, args: string, error: Error): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<BuildRawConfig>,
    result: DeepPartial<BuildConfig>,
): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<BuildRawConfig>,
    error: Error,
): void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function testConfig(name: string, args: string, config: any, result?: any): void {
    it(name, async () => {
        if (!result) {
            result = config;
            config = {};
        }

        resolveConfig.mockImplementation((path, {defaults}) => {
            if (path.endsWith('.yfmlint')) {
                return withConfigUtils(path, {});
            }

            if (path.endsWith('redirects.yaml')) {
                return withConfigUtils(null, {});
            }

            return withConfigUtils(path, {
                ...defaults,
                ...config,
            });
        });

        handler.mockImplementation((run: Run) => {
            expect(run.config).toMatchObject(result as Partial<BuildRawConfig>);
        });

        if (result instanceof Error) {
            await expect(() =>
                runBuild('--input ./input --output ./output ' + args),
            ).rejects.toThrow(result);
        } else {
            await runBuild('--input ./input --output ./output ' + args);

            expect(handler).toBeCalled();
        }
    });
}

export function testBooleanFlag(name: string, arg: string, defaults: boolean) {
    describe(name, () => {
        testConfig('should handle default', '', {
            [name]: defaults,
        });

        testConfig('should handle arg', arg, {
            [name]: true,
        });

        testConfig(
            'should handle config enabled',
            '',
            {
                [name]: true,
            },
            {
                [name]: true,
            },
        );

        testConfig(
            'should handle config disabled',
            '',
            {
                [name]: false,
            },
            {
                [name]: false,
            },
        );
    });
}
