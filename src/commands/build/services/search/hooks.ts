import type {SearchService} from '.';
import type {SearchProvider} from './types';
import type {SearchServiceConfig} from './SearchService';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks<TConfig extends SearchServiceConfig['search']>(name: string) {
    return {
        Provider: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[SearchProvider, TConfig]>(
                    ['provider', 'config'],
                    `${name}.Provider(${type})`,
                ),
        ),
    };
}

const [getHooksInternal, withHooks] = generateHooksAccess('Search', hooks);

function getHooks<TConfig = SearchServiceConfig['search']>(holder: SearchService | undefined) {
    return getHooksInternal(holder) as unknown as ReturnType<
        typeof hooks<TConfig & SearchServiceConfig['search']>
    >;
}

export {getHooks, withHooks};
