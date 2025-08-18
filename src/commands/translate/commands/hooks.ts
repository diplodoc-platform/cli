import type {Run} from '../run';

import {AsyncSeriesHook} from 'tapable';

import {generateHooksAccess} from '~/core/utils';

export function hooks(name: string) {
    return {
        BeforeRun: new AsyncSeriesHook<Run>(['run'], `${name}.BeforeRun`),
    };
}

const [getHooks, withHooks] = generateHooksAccess('Extract', hooks);

export {getHooks, withHooks};
