import type {LeadingPage, Plugin} from './types';

import {AsyncParallelHook, AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        /**
         * Emits relative to root asset path on each local link in Leading.
         * This includes paths in links and blocks sections.
         */
        Asset: new AsyncParallelHook<[RelativePath, RelativePath]>(
            ['asset', 'path'],
            `${name}.Asset`,
        ),
        Plugins: new AsyncSeriesWaterfallHook<[Plugin[]]>(['plugins'], `${name}.Plugins`),
        Resolved: new AsyncSeriesHook<[DeepFrozen<LeadingPage>, RelativePath]>(
            ['leading', 'path'],
            `${name}.Resolved`,
        ),
        Dump: new AsyncSeriesWaterfallHook<[LeadingPage, NormalizedPath]>(
            ['leading', 'path'],
            `${name}.Dump`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Leading', hooks);

export {getHooks, withHooks};
