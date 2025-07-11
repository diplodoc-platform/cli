import type {BaseProgram} from '~/core/program';
import type {Run} from './run';
import type {PositionedEntryInfo} from './types';

import {AsyncSeriesHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

import {OutputFormat} from './config';

export function hooks<TRun extends Run>(name: string) {
    return {
        /**
         * Async series hook map (md|html) which runs before start of target Run type.<br/><br/>
         *
         * @usage Best place to subscribe on target Run hooks.
         *
         * @prop run - constructed run context.
         */
        BeforeRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<[TRun]>(['run'], `${name}.${format}.BeforeRun`),
        ),
        /**
         * Async series hook map (md|html) which runs when project entry (each member of toc)
         * was completely resolved.<br/>
         *
         * @usage Best place to consume entry info in extensions.<br/>
         *
         * @prop entry - entry path resolved relative to project root.
         * @prop info - completely resolved entry info. (Can't be modified)
         */
        Entry: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<[TRun, NormalizedPath, DeepFrozen<PositionedEntryInfo>]>(
                    ['run', 'entry', 'info'],
                    `${name}.${format}.Entry`,
                ),
        ),
        /**
         * Async series hook map (md|html) which runs after build.<br/><br/>
         *
         * @usage Best place to release artifacts dependent on build results.<br/>
         *
         * @prop run - released run context.
         */
        AfterRun: new HookMap(
            (format: `${OutputFormat}`) =>
                new AsyncSeriesHook<[TRun]>(['run'], `${name}.${format}.AfterRun`),
        ),
    };
}

const [getHooksInternal, withHooks] = generateHooksAccess('Build', hooks);

function getHooks<TRun extends Run = Run, TProgram extends BaseProgram = BaseProgram>(
    holder: TProgram,
) {
    return getHooksInternal(holder) as unknown as ReturnType<typeof hooks<TRun>>;
}

export {getHooks, withHooks};
