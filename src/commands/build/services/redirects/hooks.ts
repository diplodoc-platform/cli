import type {Redirects} from './types';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Release: new AsyncSeriesWaterfallHook<[Redirects | null]>(['redirects'], `${name}.Release`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Redirects', hooks);

export {getHooks, withHooks};
