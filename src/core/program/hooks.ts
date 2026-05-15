import type {BaseProgram} from '~/core/program';
import type {Command, Config, ExtendedOption} from '~/core/config';
import type {Run} from '~/core/run';
import type {BaseArgs, BaseConfig} from './types';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook, SyncHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

type TConfig<TProgram extends BaseProgram> =
    TProgram extends BaseProgram<infer T> ? Config<T> : BaseConfig;

type TArgs<TProgram extends BaseProgram> =
    TProgram extends BaseProgram<BaseConfig, infer T> ? T : BaseArgs;

export function hooks<TRun extends Run, TConfig extends BaseConfig, TArgs extends BaseArgs>(
    name: string,
) {
    return {
        Command: new SyncHook<[Command, ExtendedOption[]]>(
            ['command', 'options'],
            `${name}.Command`,
        ),
        /**
         * Async series hook which runs when current program config
         * was completely resolved but not merged with args.<br/>
         * **Config can't be modified here.**
         *
         * @usage Best place to validate that config doesn't store any secret data.
         *
         * @prop config - completely built config specified for current program.
         * @prop args - program call args.
         */
        RawConfig: new AsyncSeriesHook<[DeepFrozen<TConfig>, TArgs]>(
            ['config', 'args'],
            `${name}.Config`,
        ),
        /**
         * Async series **waterfall** hook which runs when current program config
         * was completely resolved and merged with args.<br/>
         * **Config can be modified here.**
         *
         * @usage Best place to normalize final config data.<br/>
         *
         * @prop config - completely built config specified for current program.
         * @prop args - previously merged to config program call args.
         */
        Config: new AsyncSeriesWaterfallHook<[TConfig, TArgs]>(
            ['config', 'args'],
            `${name}.Config`,
        ),
        /**
         * Async series hook which runs before start of any Run type.<br/>
         *
         * @usage Best place to subscribe on Run services hooks.
         *
         * @prop run - [Run](../run) constructed context.
         */
        BeforeAnyRun: new AsyncSeriesHook<[TRun]>(['run'], `${name}.BeforeAnyRun`),
        /**
         * Async series hook which runs after all entries processing.<br/>
         *
         * @usage Best place to emit additional assets on output fs.
         *
         * @prop run - [Run](../run) constructed context.
         */
        AfterAnyRun: new AsyncSeriesHook<[TRun]>(['run'], `${name}.AfterAnyRun`),
        /**
         * Async series **waterfall** hook which runs when current program fails with error.<br/>
         * If someone from handlers will return `undefined`, then error will be ignored.
         *
         * @usage Best place to handle uncaught program errors.<br/>
         *
         * @prop error - thrown error or undefined.
         */
        Error: new AsyncSeriesWaterfallHook<[unknown]>(['error'], `${name}.Error`),
    };
}

const [getHooksInternal, withHooks] = generateHooksAccess('Base', hooks);

function getHooks<TRun extends Run = Run, TProgram extends BaseProgram = BaseProgram>(
    holder: TProgram,
) {
    return getHooksInternal(holder) as unknown as ReturnType<
        typeof hooks<TRun, TConfig<TProgram>, TArgs<TProgram>>
    >;
}

export {getHooks, withHooks};
