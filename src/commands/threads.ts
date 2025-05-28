import type {LogConsumer, LogRecord} from '~/core/logger';

import os from 'node:os';
import {isMainThread} from 'node:worker_threads';
import {get} from 'lodash';
// @ts-ignore
import {Pool, Worker, spawn} from 'threads';
// @ts-ignore
import {Observable, Subject} from 'threads/observable';
// @ts-ignore
import {expose} from 'threads/worker';

import {Defer, all} from '~/core/utils';
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
            return method(...unpack(args));
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
                const thread = await spawn<ThreadAPI>(new Worker('./index'));

                threads[index++].resolve(thread);

                return thread;
            },
            {size: jobs, concurrency: 50},
        );
    }
}

export async function setup() {
    await all(
        threads.map(async (defer) => {
            const thread = await defer.promise;

            await thread.init(argv);

            program.logger.subscribe(thread.logger());
        }),
    );
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
                            return thread.call(call, pack(thread, args));
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

type CountedMap = Map<string, unknown> & {idx: number};
type CountedWeakMap = WeakMap<object, number> & {idx: number};

const mems = new Map() as Map<unknown, CountedWeakMap>;
const refs = new Map() as CountedMap;
refs.idx = 1;

function pack(thread: ThreadAPI, args: unknown[]) {
    const mem = mems.get(thread) || (new WeakMap() as CountedWeakMap);

    mems.set(thread, mem);
    mem.idx = mem.idx || 1;

    return args.map((arg) => {
        if (arg && typeof arg === 'object') {
            if (mem.has(arg)) {
                return '#@&__' + mem.get(arg);
            } else {
                mem.set(arg, mem.idx++);
                return arg;
            }
        } else {
            return arg;
        }
    });
}

function unpack(args: unknown[]) {
    return args.map((arg) => {
        if (typeof arg === 'string' && arg.match(/^#@&__/)) {
            return refs.get(arg);
        } else if (arg && typeof arg === 'object') {
            refs.set('#@&__' + refs.idx++, arg);
            return arg;
        } else {
            return arg;
        }
    });
}
