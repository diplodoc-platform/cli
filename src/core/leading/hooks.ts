import type {VFile} from '~/core/utils';
import type {LeadingPage, Plugin} from './types';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

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
        Dump: new AsyncSeriesHook<[VFile<LeadingPage>]>(['vfile'], `${name}.Dump`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Leading', hooks);

export {getHooks, withHooks};
