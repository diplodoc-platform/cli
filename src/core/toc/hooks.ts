import type {IncludeInfo, IncluderOptions, RawToc, RawTocItem, Toc} from './types';

import {AsyncParallelHook, AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Toc';

export function hooks() {
    return intercept(name, {
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
        Resolved: new AsyncParallelHook<[Toc, RelativePath]>(
            ['Toc', 'TocPath'],
            `${name}.Resolved`,
        ),
        Included: new AsyncParallelHook<[Toc, RelativePath, IncludeInfo]>(
            ['Toc', 'TocPath', 'IncludeInfo'],
            `${name}.Included`,
        ),
    });
}

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
