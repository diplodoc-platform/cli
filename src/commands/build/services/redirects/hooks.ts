import type {Redirects} from './types';
import type {Template} from '~/core/template';

import {AsyncSeriesHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Page: new AsyncSeriesHook<[Template]>(['template'], `${name}.Page`),
        Release: new AsyncSeriesWaterfallHook<[Redirects | null]>(['redirects'], `${name}.Release`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Redirects', hooks);

export {getHooks, withHooks};
