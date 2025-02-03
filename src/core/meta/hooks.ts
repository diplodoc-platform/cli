import type {Meta} from './types';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Meta';

export function hooks() {
    return intercept(name, {
        Dump: new AsyncSeriesWaterfallHook<[Meta, NormalizedPath]>(
            ['meta', 'path'],
            `${name}.Dump`,
        ),
    });
}

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
