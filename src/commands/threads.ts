import type {LogConsumer, LogRecord} from '~/core/logger';

import os from 'node:os';
import {isMainThread} from 'node:worker_threads';
import {get, omit} from 'lodash';
// @ts-ignore
import {Pool, Worker, registerSerializer, spawn} from 'threads';
// @ts-ignore
import {Observable, Subject} from 'threads/observable';
// @ts-ignore
import {expose} from 'threads/worker';

import {Defer, Graph, all, console, race, wait} from '~/core/utils';
import {LogLevel} from '~/core/logger';
import {Program, parse} from '~/commands';

let pool: Pool;
let program: Program;
let threads: Defer<ThreadAPI>[] = [];
let argv: string[] = [];

type ThreadAPI = {
    init(argv: string[]): Promise<Subject<LogRecord>>;
    call(method: string, args: unknown[]): Promise<unknown>;
    logger(): Observable<LogRecord>;
};

function writer(subject: Subject<LogRecord>, level: string) {
    return function (...msgs: string[]) {
        subject.next({level, message: msgs.join(' ')});
    };
}

registerSerializer({
    deserialize(message: any, defaultHandler: Function) {
        if (isError(message)) {
            return Object.assign(new Error(message.message), omit(message, '__type'));
        }
        if (Graph.is(message)) {
            return Graph.deserialize(message as any);
        } else if (Array.isArray(message)) {
            return defaultHandler(
                message.map((item: unknown) => {
                    if (Graph.is(item)) {
                        return Graph.deserialize(item);
                    }

                    return item;
                }),
            );
        } else if (typeof message === 'object') {
            const graphs = Object.keys(message).filter((key) => Graph.is(message[key]));
            const parsed = Object.fromEntries(
                graphs.map((key) => [key, Graph.deserialize(message[key])]),
            );

            return defaultHandler({
                ...message,
                ...parsed,
            });
        } else {
            return defaultHandler(message);
        }
    },
    serialize(message: any, defaultHandler: Function) {
        if (isError(message)) {
            return defaultHandler({
                ...message,
                message: message.message,
                stack: message.stack,
                __type: '$$Error',
            });
        } else if (message instanceof Graph) {
            return defaultHandler(message.serialize());
        } else if (Array.isArray(message)) {
            return defaultHandler(
                message.map((item: unknown) => {
                    if (item instanceof Graph) {
                        return item.serialize();
                    }

                    return item;
                }),
            );
        } else if (typeof message === 'object') {
            const graphs = Object.keys(message).filter((key) => message[key] instanceof Graph);
            const serialized = Object.fromEntries(
                graphs.map((key) => [key, message[key].serialize()]),
            );

            return defaultHandler({
                ...message,
                ...serialized,
            });
        } else {
            return defaultHandler(message);
        }
    },
});

if (!isMainThread) {
    const subject = new Subject<LogRecord>();
    const logger = {
        [Symbol.for(LogLevel.INFO)]: writer(subject, LogLevel.INFO),
        [Symbol.for(LogLevel.WARN)]: writer(subject, LogLevel.WARN),
        [Symbol.for(LogLevel.ERROR)]: writer(subject, LogLevel.ERROR),
    } as LogConsumer;

    expose({
        async init(argv: string[]) {
            const args = parse(argv);

            program = new Program();
            program.logger.pipe(logger);

            await program.init(args);
            await program.parse(argv);
        },
        async call(call: string, args: unknown[]) {
            const method = get(program, call);
            return method(...args);
        },
        logger() {
            return Observable.from(subject);
        },
    });
}

export async function init(_program: Program, runargv: string[]) {
    let {jobs} = parse(runargv);

    if (jobs === true) {
        jobs = os.cpus().length - 1;
    }

    jobs = Number(jobs);

    if (jobs <= 1) {
        return;
    }

    console.log(`Init ${jobs} processing threads`);

    program = _program;
    argv = runargv;
    threads = Array(jobs)
        .fill(true)
        .map(() => new Defer());

    if (isMainThread) {
        let index = 0;
        // eslint-disable-next-line new-cap
        pool = Pool(
            async () => {
                const defer = threads[index++];
                const thread = await spawn<ThreadAPI>(new Worker('./index'));

                defer.resolve(thread);

                return thread;
            },
            {size: jobs, concurrency: 50},
        );
    }
}

export async function setup() {
    if (!threads.length) {
        return;
    }

    console.log('Wait for threads setup');

    const reset = wait(30000, () => {
        console.log('Threads setup timed out');
        threads.length = 0;
    });

    await race([
        all(
            threads.map(async (defer) => {
                const thread = await defer.promise;

                await thread.init(argv);

                program.logger.subscribe(thread.logger());
            }),
        ).then(reset.skip),
        reset,
    ]);
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
                    if (pool && threads.length) {
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

export function multicast(call: string) {
    return function (_originalMethod: unknown, context: ClassMethodDecoratorContext) {
        const methodName = context.name;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.addInitializer(function (this: any) {
            const method = this[methodName];

            if (isMainThread) {
                this[methodName] = function (...args: unknown[]) {
                    if (pool && threads.length) {
                        return all(
                            threads.map(async (defer) => {
                                const thread = await defer.promise;

                                await thread.call(call, args);
                            }),
                        );
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

function isError(data: unknown) {
    return Boolean(
        data instanceof Error ||
            (data && typeof data === 'object' && '__type' in data && data.__type === '$$Error'),
    );
}
