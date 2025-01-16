import type {Run} from './run';

import {AsyncParallelHook, AsyncSeriesHook, HookMap} from 'tapable';

import {intercept} from '~/utils';

import {OutputFormat} from './config';

const name = 'Build';

export function hooks() {
    return intercept(name, {
        /**
         * Async series hook which runs before start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to subscribe on Run hooks.
         */
        BeforeAnyRun: new AsyncSeriesHook<Run>(['run'], `${name}.BeforeAnyRun`),
        /**
         * Async series hook map which runs before start of target Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to subscribe on target Run hooks.
         */
        BeforeRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `${name}.${format}.BeforeRun`),
        ),
        /**
         * Async parallel hook which runs on start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to do something in parallel with main build process.
         */
        Run: new AsyncParallelHook<Run>(['run'], `${name}.Run`),
        // TODO: decompose handler and describe this hook
        AfterRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<Run>(['run'], `${name}.${format}.AfterRun`),
        ),
        // TODO: decompose handler and describe this hook
        AfterAnyRun: new AsyncSeriesHook<Run>(['run'], `${name}.AfterAnyRun`),
        Cleanup: new AsyncParallelHook<Run>(['run'], `${name}.Cleanup`),
    });
}

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks(program: {[Hooks]?: ReturnType<typeof hooks>}) {
    return program[Hooks] || hooks();
}
