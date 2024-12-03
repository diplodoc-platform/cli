import type {Preset, Presets} from './types';

import {dirname, join} from 'node:path';
import {merge} from 'lodash';
import {dump, load} from 'js-yaml';

import {Run} from '~/commands/build';
import {freeze, own} from '~/utils';
import {AsyncParallelHook, AsyncSeriesWaterfallHook} from 'tapable';

export type VarsServiceConfig = {
    varsPreset: string;
    vars: Hash;
};

type VarsServiceHooks = {
    /**
     * Async waterfall hook.
     * Called after any presets.yaml was loaded.
     */
    PresetsLoaded: AsyncSeriesWaterfallHook<[Presets, RelativePath]>;
    /**
     * Async parallel hook.
     * Called after vars was resolved on any level.
     * Vars data is sealed here.
     */
    Resolved: AsyncParallelHook<[Preset, RelativePath]>;
};

export class VarsService {
    hooks: VarsServiceHooks;

    private run: Run;

    private fs: Run['fs'];

    private logger: Run['logger'];

    private config: VarsServiceConfig;

    private cache: Record<RelativePath, Hash> = {};

    constructor(run: Run) {
        this.run = run;
        this.fs = run.fs;
        this.logger = run.logger;
        this.config = run.config;
        this.hooks = {
            PresetsLoaded: new AsyncSeriesWaterfallHook(['presets', 'path']),
            Resolved: new AsyncParallelHook(['vars', 'path']),
        };
    }

    async load(path: RelativePath) {
        const varsPreset = this.config.varsPreset || 'default';
        const file = join(dirname(path), 'presets.yaml');

        if (this.cache[file]) {
            return this.cache[file];
        }

        this.logger.proc(path);

        const scopes = [];

        if (dirname(path) !== '.') {
            scopes.push(await this.load(dirname(path)));
        }

        try {
            const presets = await this.hooks.PresetsLoaded.promise(
                load(await this.fs.readFile(join(this.run.input, file), 'utf8')) as Presets,
                file,
            );

            scopes.push(presets['default']);

            if (varsPreset && varsPreset !== 'default') {
                scopes.push(presets[varsPreset] || {});
            }
        } catch (error) {
            if (!own(error, 'code') || error.code !== 'ENOENT') {
                throw error;
            }
        }

        scopes.push(this.config.vars);

        this.cache[file] = freeze(merge({}, ...scopes));

        await this.hooks.Resolved.promise(this.cache[file], file);

        return this.cache[file];
    }

    dump(presets: Hash): string {
        return dump(presets, {
            lineWidth: 120,
        });
    }

    entries() {
        return Object.entries(this.cache);
    }
}
