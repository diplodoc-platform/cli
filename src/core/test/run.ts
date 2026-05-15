import type {MockInstance} from 'vitest';
import type {BaseConfig} from '~/core/program';
import type {Config} from '~/core/config';

import {join} from 'node:path';
import {expect, vi} from 'vitest';
import {when} from 'vitest-when';

import {Run} from '~/core/run';

export type RunSpy<C extends BaseConfig = BaseConfig> = Run<C> & {
    glob: MockInstance<Run['glob']>;
    copy: MockInstance<Run['copy']>;
    read: MockInstance<Run['read']>;
    write: MockInstance<Run['write']>;
};

const stringify = (arg: unknown) => {
    if (typeof arg === 'object' && arg) {
        return JSON.stringify(arg);
    }

    return String(arg);
};

export function setupRun<C = BaseConfig>(config: DeepPartial<C>): RunSpy<BaseConfig & C> {
    const run = new Run({
        input: '/dev/null/input',
        ...config,
    } as Config<BaseConfig & C>);

    const impl =
        (method: string) =>
        (...args: unknown[]) => {
            throw new Error(
                `Method ${method} with args\n${args.map(stringify).join('\n')} not implemented.`,
            );
        };

    for (const method of ['glob', 'copy', 'read', 'write', 'remove', 'realpath'] as string[]) {
        // @ts-ignore
        vi.spyOn(run, method).mockImplementation(impl(method));
    }

    for (const method of ['proc', 'info', 'warn', 'error'] as string[]) {
        // @ts-ignore
        vi.spyOn(run.logger, method).mockImplementation(() => {});
    }

    return run as RunSpy<BaseConfig & C>;
}

type Anything = ReturnType<typeof expect.anything>;

type MockData = {
    glob?: Record<string, NormalizedPath[] | Error> | Anything;
    read?: Record<string, string | Error> | Anything;
    write?: Anything;
    remove?: Anything;
};

export function mockRun(run: RunSpy, data: MockData) {
    if (data.write === expect.anything()) {
        when(run.write).calledWith(expect.anything(), expect.anything()).thenResolve();
    }

    if (data.write === expect.anything()) {
        when(run.remove).calledWith(expect.anything()).thenResolve();
    }

    if (data.glob === expect.anything()) {
        when(run.glob).calledWith(expect.anything(), expect.anything()).thenResolve([]);
    } else {
        for (const [match, result] of Object.entries(
            (data.glob || {}) as Record<string, NormalizedPath[] | Error>,
        )) {
            if (result instanceof Error) {
                when(run.glob).calledWith(match, expect.anything()).thenReject(result);
            } else {
                when(run.glob).calledWith(match, expect.anything()).thenResolve(result);
            }
        }
    }

    if (data.read === expect.anything()) {
        when(run.read).calledWith(expect.anything()).thenResolve('');
    } else {
        for (const [file, result] of Object.entries(
            (data.read || {}) as Record<string, string | Error>,
        )) {
            if (result instanceof Error) {
                when(run.read).calledWith(join(run.input, file)).thenReject(result);
            } else {
                when(run.read).calledWith(join(run.input, file)).thenResolve(result);
            }
        }
    }
}
