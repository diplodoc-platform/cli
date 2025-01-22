import type {VcsConnector} from './types';

import {AsyncSeriesWaterfallHook, HookMap} from 'tapable';

import {intercept} from '~/core/utils';

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

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks<T extends {[Hooks]?: ReturnType<typeof hooks>}>(program: T | undefined) {
    return (program && program[Hooks]) || hooks();
}
