import type {Preset, Presets} from './types';

import {AsyncParallelHook, AsyncSeriesWaterfallHook} from 'tapable';

import {intercept} from '~/core/utils';

const name = 'Vars';

export function hooks() {
    return intercept(name, {
        /**
         * Async waterfall hook.<br>
         * Called after any presets.yaml was loaded.
         */
        PresetsLoaded: new AsyncSeriesWaterfallHook<[Presets, RelativePath]>(
            ['presets', 'path'],
            `${name}.PresetsLoaded`,
        ),
        /**
         * Async parallel hook.<br>
         * Called after vars was resolved on any level.<br>
         * Vars data is sealed here.
         */
        Resolved: new AsyncParallelHook<[Preset, RelativePath]>(
            ['vars', 'path'],
            `${name}.Resolved`,
        ),
    });
}

export const Hooks = Symbol(`${name}Hooks`);

export function getHooks(program: {[Hooks]?: ReturnType<typeof hooks>} | undefined) {
    return (program && program[Hooks]) || hooks();
}
