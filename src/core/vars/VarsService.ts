import type {Presets} from './types';

import {dirname, join} from 'node:path';
import {merge} from 'lodash';
import {dump, load} from 'js-yaml';

import {Run} from '~/commands/build';
import {freeze, normalizePath, own} from '~/utils';

import {Hooks, hooks} from './hooks';

export type VarsServiceConfig = {
    varsPreset: string;
    vars: Hash;
    ignore: string[];
};

export class VarsService {
    [Hooks] = hooks();

    get entries() {
        return [...Object.entries(this.cache)];
    }

    private run: Run;

    private logger: Run['logger'];

    private config: VarsServiceConfig;

    private cache: Record<NormalizedPath, Hash> = {};

    constructor(run: Run) {
        this.run = run;
        this.logger = run.logger;
        this.config = run.config;
    }

    async init() {
        const presets = await this.run.glob('**/presets.yaml', {
            cwd: this.run.input,
        });

        for (const preset of presets) {
            await this.load(preset);
        }
    }

    async load(path: RelativePath) {
        path = normalizePath(path);

        const varsPreset = this.config.varsPreset || 'default';
        const file = normalizePath(join(dirname(path), 'presets.yaml'));

        if (this.cache[file]) {
            return this.cache[file];
        }

        this.logger.proc(file);

        const scopes = [];

        if (dirname(path) !== '.') {
            scopes.push(await this.load(dirname(path)));
        }

        try {
            const presets = await this[Hooks].PresetsLoaded.promise(
                load(await this.run.read(join(this.run.input, file))) as Presets,
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

        await this[Hooks].Resolved.promise(this.cache[file], file);

        return this.cache[file];
    }

    dump(presets: Hash): string {
        return dump(presets, {
            lineWidth: 120,
        });
    }
}
