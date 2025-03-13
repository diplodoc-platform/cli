import type {AdditionalInfo, Collect, Plugin} from './types';

import {AsyncParallelHook, AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';
import {Meta} from '~/core/meta';

export function hooks(name: string) {
    return {
        Collects: new AsyncSeriesWaterfallHook<[Collect[]]>(['collects'], `${name}.Collects`),
        Plugins: new AsyncSeriesWaterfallHook<[Plugin[]]>(['plugins'], `${name}.Plugins`),
        Loaded: new AsyncSeriesHook<[string, DeepFrozen<Meta>, NormalizedPath]>(
            ['markdown', 'meta', 'path'],
            `${name}.Loaded`,
        ),
        /**
         * Emits relative to root asset path on each local link in Leading.
         * This includes paths in links and blocks sections.
         */
        Asset: new AsyncParallelHook<[NormalizedPath, NormalizedPath]>(
            ['asset', 'path'],
            `${name}.Asset`,
        ),
        Resolved: new AsyncSeriesHook<[string, NormalizedPath]>(
            ['markdown', 'path'],
            `${name}.Resolved`,
        ),
        Dump: new AsyncSeriesWaterfallHook<[string, NormalizedPath, AdditionalInfo]>(
            ['markdown', 'path', 'info'],
            `${name}.Dump`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Markdown', hooks);

export {getHooks, withHooks};
