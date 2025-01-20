import {intercept} from '~/utils';
import type {Command, Config, ExtendedOption} from '~/core/config';
import type {Run} from '~/core/run';
import {AsyncSeriesHook, AsyncSeriesWaterfallHook, SyncHook} from 'tapable';

export function hooks<TConfig extends BaseConfig, TArgs extends BaseArgs>(name: string) {
    return intercept(name, {
        Command: new SyncHook<[Command, ExtendedOption[]]>(
            ['command', 'options'],
            `${name}.Command`,
        ),
        /**
         * Called on resolved config, before it will be merged with args.
         * Best place to validate that config doesn't store some secret data.
         * Config can't be modified here.
         */
        RawConfig: new AsyncSeriesHook<[Config<TConfig>, TArgs]>(
            ['config', 'args'],
            `${name}.Config`,
        ),
        /**
         * Called on resolved config, after it was merged with args.
         * Best place to normalize final config data.
         * Config can be modified here.
         */
        Config: new AsyncSeriesWaterfallHook<[Config<TConfig>, TArgs]>(
            ['config', 'args'],
            `${name}.Config`,
        ),
        /**
         * Async series hook which runs before start of any Run type.<br/><br/>
         * Args:
         * - run - [Build.Run](./Run.ts) constructed context.<br/>
         * Best place to subscribe on Run services hooks.
         */
        BeforeAnyRun: new AsyncSeriesHook<Run<TConfig>>(['run'], `${name}.BeforeAnyRun`),
        // TODO: decompose handler and describe this hook
        AfterAnyRun: new AsyncSeriesHook<Run<TConfig>>(['run'], `${name}.AfterAnyRun`),
    });
}

export const Hooks = Symbol(`BaseHooks`);

export function getHooks<TConfig, TArgs>(program: {
    [Hooks]?: ReturnType<typeof hooks<TConfig, TArgs>>;
}) {
    return program[Hooks] || hooks('Unknown');
}
