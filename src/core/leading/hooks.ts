import type {LeadingPage, Plugin} from './types';

import {AsyncParallelHook, AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';
import {Meta} from '~/core/meta';

export function hooks(name: string) {
    return {
        Plugins: new AsyncSeriesWaterfallHook<[Plugin[]]>(['plugins'], `${name}.Plugins`),
        Loaded: new AsyncSeriesHook<[DeepFrozen<LeadingPage>, DeepFrozen<Meta>, NormalizedPath]>(
            ['leading', 'meta', 'path'],
            `${name}.Loaded`,
        ),
        Resolved: new AsyncSeriesHook<[DeepFrozen<LeadingPage>, DeepFrozen<Meta>, NormalizedPath]>(
            ['leading', 'meta', 'path'],
            `${name}.Resolved`,
        ),
        /**
         * Emits relative to root asset path on each local link in Leading.
         * This includes paths in links and blocks sections.
         */
        Asset: new AsyncParallelHook<[NormalizedPath, NormalizedPath]>(
            ['asset', 'path'],
            `${name}.Asset`,
        ),
        Dump: new AsyncSeriesWaterfallHook<[LeadingPage, NormalizedPath]>(
            ['leading', 'path'],
            `${name}.Dump`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Leading', hooks);

export {getHooks, withHooks};
