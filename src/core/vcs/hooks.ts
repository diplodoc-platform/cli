import type {Run} from '~/commands/build';
import type {VCSConnector} from '~/vcs-connector/connector-models';

import {AsyncSeriesWaterfallHook} from 'tapable';

import {intercept} from '~/utils';

const name = 'Vcs';

export function hooks() {
    return intercept(name, {
        VCSConnector: new AsyncSeriesWaterfallHook<[VCSConnector | null, Run['config']]>(
            ['connector', 'config'],
            `${name}.VCSConnector`,
        ),
    });
}

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks(program: {[Hooks]?: ReturnType<typeof hooks>}) {
    return program[Hooks] || hooks();
}
