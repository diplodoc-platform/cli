import type {AdditionalInfo, Collect, Plugin} from './types';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';
import {Meta} from '~/core/meta';

export function hooks(name: string) {
    return {
        Collects: new AsyncSeriesWaterfallHook<[Collect[]]>(['collects'], `${name}.Collects`),
        Plugins: new AsyncSeriesWaterfallHook<[Plugin[]]>(['plugins'], `${name}.Plugins`),
        Loaded: new AsyncSeriesHook<[string, DeepFrozen<Meta>, NormalizedPath, NormalizedPath[]]>(
            ['markdown', 'meta', 'path', 'from'],
            `${name}.Loaded`,
        ),
        Resolved: new AsyncSeriesHook<[string, NormalizedPath, NormalizedPath[]]>(
            ['markdown', 'path', 'from'],
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
