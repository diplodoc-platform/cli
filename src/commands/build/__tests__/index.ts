import type {BuildConfig, BuildRawConfig} from '..';
import type {Mock, MockInstance} from 'vitest';

import {join} from 'node:path';
import {merge} from 'lodash';
import {describe, expect, it, vi} from 'vitest';
import {when} from 'vitest-when';
import {Build} from '..';
import {Run} from '../run';
import {parse} from '~/commands';
import {handler as originalHandler} from '../handler';
import {getHooks as getBaseHooks} from '~/core/program';
import {withConfigUtils} from '~/core/config';

export const handler = originalHandler as Mock;

// eslint-disable-next-line no-var
var resolveConfig: Mock;

vi.mock('../handler');
vi.mock('~/core/config', async (importOriginal) => {
    resolveConfig = vi.fn((_path, {defaults, fallback}) => {
        return defaults || fallback;
    });

    return {
        ...((await importOriginal()) as {}),
        resolveConfig,
    };
});

const Mocked = Symbol('Mocked');

export type RunSpy = Run & {
    glob: MockInstance<Run['glob']>;
    copy: MockInstance<Run['copy']>;
    read: MockInstance<Run['read']>;
    write: MockInstance<Run['write']>;
    [Mocked]: boolean;
};

export function setupRun(config: DeepPartial<BuildConfig>, run?: Run): RunSpy {
    run =
        run ||
        new Run({
            input: '/dev/null/input',
            output: '/dev/null/output',
            ...config,
        } as BuildConfig);

    const stringify = (arg: unknown) => {
        if (typeof arg === 'object' && arg) {
            return JSON.stringify(arg);
        }

        return String(arg);
    };

    const impl =
        (method: string) =>
        (...args: unknown[]) => {
            throw new Error(
                `Method ${method} with args\n${args.map(stringify).join('\n')} not implemented.`,
            );
        };

    for (const method of ['glob', 'copy', 'read', 'write', 'remove'] as string[]) {
        // @ts-ignore
        vi.spyOn(run, method).mockImplementation(impl(method));
    }

    for (const method of ['proc', 'info', 'warn', 'error'] as string[]) {
        // @ts-ignore
        vi.spyOn(run.logger, method).mockImplementation(() => {});
    }

    (run as RunSpy)[Mocked] = true;

    return run as RunSpy;
}

export function run(build: Build) {
    // @ts-ignore
    return build.run;
}

type BuildState = {
    globs?: Hash<NormalizedPath[]>;
    files?: Hash<string>;
};
export function setupBuild(state?: BuildState): Build {
    const build = new Build();

    getBaseHooks(build).BeforeAnyRun.tap('Tests', (run) => {
        if (!(run as RunSpy)[Mocked]) {
            setupRun({}, run as Run);
        }

        when(run.copy).calledWith(expect.anything(), expect.anything()).thenResolve();
        when(run.copy)
            .calledWith(expect.anything(), expect.anything(), expect.anything())
            .thenResolve();
        when(run.write).calledWith(expect.anything(), expect.anything()).thenResolve();
        when(run.remove).calledWith(expect.anything()).thenResolve();
        when(run.glob).calledWith('**/toc.yaml', expect.anything()).thenResolve([]);
        when(run.glob).calledWith('**/presets.yaml', expect.anything()).thenResolve([]);

        if (state && state.globs) {
            for (const [pattern, files] of Object.entries(state.globs)) {
                when(run.glob).calledWith(pattern, expect.anything()).thenResolve(files);
            }
        }

        if (state && state.files) {
            for (const [file, content] of Object.entries(state.files)) {
                when(run.read).calledWith(join(run.input, file)).thenResolve(content);
            }
        }
    });

    return build;
}

export async function runBuild(argv: string, build?: Build) {
    build = build || setupBuild();

    const rawArgs = ['node', 'index'].concat(argv.split(' '));
    const args = parse(rawArgs, 'build');

    await build.init(args);
    await build.parse(rawArgs);
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

            return withConfigUtils(path, merge({}, defaults, config));
        });

        handler.mockImplementation((run: Run) => {
            expect(run.config).toMatchObject(result as Partial<BuildRawConfig>);
        });

        if (result instanceof Error) {
            await expect(() =>
                runBuild('--input ./input --output ./output ' + args),
            ).rejects.toThrow(expect.objectContaining(result));
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
