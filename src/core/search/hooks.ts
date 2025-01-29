import type {SearchProvider} from './types';
import type {SearchServiceConfig} from './SearchService';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Search';

export function hooks<TConfig extends SearchServiceConfig['search']>() {
    return intercept(name, {
        Provider: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[SearchProvider, TConfig]>(
                    ['provider', 'config'],
                    `${name}.Provider(${type})`,
                ),
        ),
    });
}

const [getHooksInternal, withHooks, Hooks] = generateHooksAccess(name, hooks);

function getHooks<TConfig = SearchServiceConfig['search']>(
    holder: {
        // @ts-ignore
        [Hooks]: ReturnType<typeof hooks<TConfig & SearchServiceConfig['search']>>;
    } | undefined,
) {
    return getHooksInternal(holder) as unknown as ReturnType<typeof hooks<TConfig & SearchServiceConfig['search']>>;
}


export {getHooks, withHooks};
