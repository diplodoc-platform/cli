import type {VFile} from '~/core/utils';
import type {Collect, Plugin} from './types';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

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
        Resolved: new AsyncSeriesHook<[string, NormalizedPath]>(
            ['markdown', 'path'],
            `${name}.Resolved`,
        ),
        Dump: new AsyncSeriesHook<VFile<string>>(['vfile'], `${name}.Dump`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Markdown', hooks);

export {getHooks, withHooks};
