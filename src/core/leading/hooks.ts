import type {LeadingPage} from './types';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Leading';

export function hooks() {
    return intercept(name, {
        Dump: new AsyncSeriesWaterfallHook<[LeadingPage, NormalizedPath]>(
            ['leading', 'path'],
            `${name}.Dump`,
        ),
    });
}

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
