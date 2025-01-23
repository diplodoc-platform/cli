import type {VcsConnector} from './types';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        VcsConnector: new HookMap(
            (type: string) =>
                new AsyncSeriesWaterfallHook<[VcsConnector]>(
                    ['connector'],
                    `${name}.VcsConnector(${type})`,
                ),
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Vcs', hooks);

export {getHooks, withHooks};
