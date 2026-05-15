import type {Run} from './run';
import type {EntryInfo} from './types';
import type {OutputFormat} from './config';

import {AsyncSeriesHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
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
                new AsyncSeriesHook<Run>(['run'], `${name}.${format}.BeforeRun`),
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
                new AsyncSeriesHook<[Run, NormalizedPath, DeepFrozen<EntryInfo>]>(
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
                new AsyncSeriesHook<Run>(['run'], `${name}.${format}.AfterRun`),
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Build', hooks);

export {getHooks, withHooks};
