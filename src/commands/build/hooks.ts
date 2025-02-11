import type {Run} from './run';

import {AsyncParallelHook, AsyncSeriesHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

import {OutputFormat} from './config';

export function hooks(name: string) {
    return {
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
    };
}

const [getHooks, withHooks] = generateHooksAccess('Build', hooks);

export {getHooks, withHooks};
