import type {BaseArgs} from '~/core/program';

import os from 'node:os';
import {isMainThread} from 'node:worker_threads';
import {get} from 'lodash';
// @ts-ignore
import {Pool, Worker, spawn} from 'threads';
// @ts-ignore
import {expose} from 'threads/worker';

import {all} from '~/core/utils';
import {Program, parse} from '~/commands';

let pool: Pool;
let program: Program;

export const threads: ThreadAPI[] = [];

type ThreadAPI = {
    init(argv: string[]): Promise<void>;
    call(method: string, args: unknown[]): Promise<unknown>;
};

if (!isMainThread) {
    expose({
        async init(argv: string[]) {
            const args = parse(argv);

            program = new Program();

            await program.init(args);
            await program.parse(argv);
        },
        async call(call: string, args: unknown[]) {
            const method = get(program, call);
            return method(...args);
        },
    });
}

export async function init(_program: Program, {jobs}: BaseArgs) {
    if (jobs === true) {
        jobs = os.cpus().length - 1;
    }

    if (jobs <= 1) {
        return;
    }

    program = _program;

    if (isMainThread) {
        // eslint-disable-next-line new-cap
        pool = Pool(async () => {
            const thread = await spawn<ThreadAPI>(new Worker('./index'));

            threads.push(thread);

            return thread;
        }, jobs);
    }
}

export async function setup() {
    await all(threads.map((thread) => thread.init(process.argv)));
}

export async function terminate(force = false) {
    if (!pool) {
        return;
    }

    await pool.terminate(force);
}

export function threaded(call: string) {
    return function (_originalMethod: unknown, context: ClassMethodDecoratorContext) {
        const methodName = context.name;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.addInitializer(function (this: any) {
            const method = this[methodName];

            if (isMainThread) {
                this[methodName] = function (...args: unknown[]) {
                    if (pool) {
                        return pool.queue((thread: ThreadAPI) => {
                            return thread.call(call, args);
                        });
                    } else {
                        return method.call(this, ...args);
                    }
                };
            } else {
                this[methodName] = method.bind(this);
            }
        });
    };
}
