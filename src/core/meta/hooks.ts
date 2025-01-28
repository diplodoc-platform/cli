import type {Meta} from './types';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        Dump: new AsyncSeriesWaterfallHook<[Meta, NormalizedPath]>(
            ['meta', 'path'],
            `${name}.Dump`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Meta', hooks);

export {getHooks, withHooks};
