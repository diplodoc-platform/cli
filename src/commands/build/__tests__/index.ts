import type {Run} from '../run';
import type {Mock} from 'vitest';
import type {BuildConfig} from '..';

import {expect, it, vi} from 'vitest';
import {Build} from '..';
import {handler as originalHandler} from '../handler';

export const handler = originalHandler as Mock;

// eslint-disable-next-line no-var
var resolveConfig: Mock;

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

type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends Record<any, any> ? DeepPartial<T[P]> : T[P];
};

export function testConfig(name: string, args: string, result: DeepPartial<BuildConfig>): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<BuildConfig>,
    result: DeepPartial<BuildConfig>,
): void;
export function testConfig(name: string, args: string, config: any, result?: any): void {
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

        handler.mockImplementation((run: Run) => {
            expect(run.config).toMatchObject(result as Partial<BuildConfig>);
        });

        await runBuild('--input ./input --output ./output ' + args);

        expect(handler).toBeCalled();
    });
}
