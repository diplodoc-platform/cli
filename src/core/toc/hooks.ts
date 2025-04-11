import type {IncludeInfo, IncluderOptions, RawToc, RawTocItem, Toc} from './types';

import {AsyncParallelHook, AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        /**
         * Called before item data processing (but after data interpolation)
         */
        Item: new AsyncSeriesWaterfallHook<[RawTocItem, RelativePath]>(
            ['TocItem', 'TocPath'],
            `${name}.Item`,
        ),
        /**
         * AsyncSeriesWaterfall HookMap called for each includer name detected in toc.<br>
         * Expects RawToc as result of waterfall.
         */
        Includer: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[RawToc, IncluderOptions, RelativePath]>(
                    ['Toc', 'options', 'TocPath'],
                    `${name}.Includer(${type})`,
                ),
        ),
        Loaded: new AsyncParallelHook<[DeepFrozen<Toc>, RelativePath]>(
            ['Toc', 'TocPath'],
            `${name}.Loaded`,
        ),
        Resolved: new AsyncParallelHook<[DeepFrozen<Toc>, RelativePath]>(
            ['Toc', 'TocPath'],
            `${name}.Resolved`,
        ),
        Included: new AsyncParallelHook<[Toc, RelativePath, IncludeInfo]>(
            ['Toc', 'TocPath', 'IncludeInfo'],
            `${name}.Included`,
        ),
        Dump: new AsyncSeriesWaterfallHook<[Toc, NormalizedPath]>(['toc', 'path'], `${name}.Dump`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Toc', hooks);

export {getHooks, withHooks};
