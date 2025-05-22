import type {VFile} from '~/core/utils';
import {IncludeInfo, IncluderOptions, RawToc, RawTocItem, Toc} from './types';

import {AsyncParallelHook, AsyncSeriesHook, AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        /**
         * Called before item data processing (but after data interpolation)
         */
        Item: new AsyncSeriesWaterfallHook<[RawTocItem, NormalizedPath]>(
            ['TocItem', 'TocPath'],
            `${name}.Item`,
        ),
        /**
         * AsyncSeriesWaterfall HookMap called for each includer name detected in toc.<br>
         * Expects RawToc as result of waterfall.
         */
        Includer: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[RawToc, IncluderOptions, NormalizedPath]>(
                    ['Toc', 'options', 'TocPath'],
                    `${name}.Includer(${type})`,
                ),
        ),
        Loaded: new AsyncParallelHook<[DeepFrozen<Toc>, NormalizedPath]>(
            ['Toc', 'TocPath'],
            `${name}.Loaded`,
        ),
        Resolved: new AsyncParallelHook<[DeepFrozen<Toc>, NormalizedPath]>(
            ['Toc', 'TocPath'],
            `${name}.Resolved`,
        ),
        Included: new AsyncParallelHook<[Toc, NormalizedPath, IncludeInfo]>(
            ['Toc', 'TocPath', 'IncludeInfo'],
            `${name}.Included`,
        ),
        Dump: new AsyncSeriesHook<[VFile<Toc>]>(['vfile'], `${name}.Dump`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Toc', hooks);

export {getHooks, withHooks};
