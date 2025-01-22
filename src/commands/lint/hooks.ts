import {intercept} from '~/core/utils';
import {AsyncParallelHook, AsyncSeriesHook} from 'tapable';

const name = 'Lint';

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
         * Async parallel hook which runs on start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to do something in parallel with main build process.
         */
        Run: new AsyncParallelHook<Run>(['run'], `${name}.Run`),
        AfterAnyRun: new AsyncSeriesHook<Run>(['run'], `${name}.AfterAnyRun`),
    });
}

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks(program: {[Hooks]?: ReturnType<typeof hooks>}) {
    return program[Hooks] || hooks();
}
