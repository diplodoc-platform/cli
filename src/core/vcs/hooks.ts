import type {VcsConnector} from './types';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        VcsConnector: new AsyncSeriesWaterfallHook<[VcsConnector]>(
            ['connector'],
            `${name}.VcsConnector`,
        ),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Vcs', hooks);

export {getHooks, withHooks};
