import {intercept} from '~/utils';
import {AsyncSeriesHook, AsyncSeriesWaterfallHook, SyncHook} from 'tapable';
import type {Command, Config, ExtendedOption} from '~/config';

export function hooks<TConfig, TArgs>(name: string) {
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
    });
}

export const Hooks = Symbol(`BaseHooks`);

export function getHooks<TConfig, TArgs>(program: {
    [Hooks]?: ReturnType<typeof hooks<TConfig, TArgs>>;
}) {
    return program[Hooks] || hooks('Unknown');
}
