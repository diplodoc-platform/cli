import type {VcsConnector} from './types';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

const name = 'Vcs';

export function hooks() {
    return intercept(name, {
        VcsConnector: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[VcsConnector]>(
                    ['connector'],
                    `${name}.VcsConnector(${type})`,
                ),
        ),
    });
}

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
