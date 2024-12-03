import type {Run} from '../run';
import type {BuildConfig, BuildRawConfig} from '..';

import {join} from 'node:path';
import {Mock, describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {Build} from '..';
import {handler as originalHandler} from '../handler';
import {withConfigUtils} from '~/config';

export const handler = originalHandler as Mock;

// eslint-disable-next-line no-var
var resolveConfig: Mock;

vi.mock('shelljs');
vi.mock('../handler');
vi.mock('../run', async (importOriginal) => {
    return {
        ...((await importOriginal()) as {}),
        copy: vi.fn(),
    };
});
vi.mock('~/config', async (importOriginal) => {
    resolveConfig = vi.fn((_path, {defaults, fallback}) => {
        return defaults || fallback;
    });

    return {
        ...((await importOriginal()) as {}),
        resolveConfig,
    };
});

type BuildState = {
    globs?: Hash<string[]>;
    files?: Hash<string>;
};
export function setupBuild(state: BuildState = {}): Build & {run: Run} {
    const build = new Build();

    build.apply();
    build.hooks.BeforeAnyRun.tap('Tests', (run) => {
        (build as Build & {run: Run}).run = run;

        // @ts-ignore
        run.glob = vi.fn(() => []);
        run.copy = vi.fn();
        run.write = vi.fn();
        run.fs.writeFile = vi.fn();
        // @ts-ignore
        run.fs.readFile = vi.fn();
        // @ts-ignore
        run.logger.proc = vi.fn();
        // @ts-ignore
        run.logger.info = vi.fn();
        // @ts-ignore
        run.logger.warn = vi.fn();
        // @ts-ignore
        run.logger.error = vi.fn();

        if (state.globs) {
            for (const [pattern, files] of Object.entries(state.globs)) {
                when(run.glob).calledWith(pattern, expect.anything()).thenResolve(files);
            }
        }

        if (state.files) {
            for (const [file, content] of Object.entries(state.files)) {
                when(run.fs.readFile)
                    .calledWith(join(run.input, file), expect.anything())
                    .thenResolve(content);
            }
        }
    });

    return build as Build & {run: Run};
}

export async function runBuild(args: string, build?: Build) {
    build = build || setupBuild();
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
