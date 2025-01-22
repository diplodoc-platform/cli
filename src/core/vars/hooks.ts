import type {Preset, Presets} from './types';

import {AsyncParallelHook, AsyncSeriesWaterfallHook} from 'tapable';

import {generateHooksAccess, intercept} from '~/core/utils';

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

const [getHooks, withHooks] = generateHooksAccess(name, hooks);

export {getHooks, withHooks};
