import type {Run as BaseRun} from '~/core/run';
import {Preset, Presets} from './types';

import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {isEmpty, uniq} from 'lodash';
import {dump, load} from 'js-yaml';

import {memoize, normalizePath, own} from '~/core/utils';

import {getHooks, withHooks} from './hooks';

export type VarsServiceConfig = {
    varsPreset: string;
    vars: Hash;
};

type Run = BaseRun<VarsServiceConfig>;

@withHooks
export class VarsService {
    readonly name = 'Vars';

    get entries() {
        return this.presets;
    }

    private run: Run;

    private logger: Run['logger'];

    private config: VarsServiceConfig;

    private presets: Record<NormalizedPath, Hash> = {};

    private usePresets = true;

    constructor(run: Run, options = {usePresets: true}) {
        this.run = run;
        this.logger = run.logger;
        this.config = run.config;
        this.usePresets = options.usePresets;
    }

    async init() {
        if (this.usePresets) {
            const presets = await this.run.glob('**/presets.yaml', {
                cwd: this.run.input,
            });

            for (const preset of presets) {
                const dir = normalizePath(dirname(preset));
                this.presets[dir] = await this.load(preset);
            }
        }
    }

    hash(path: RelativePath) {
        const paths = this.paths(dirname(path));
        const hash = createHash('sha256');

        hash.update(paths.join('&'));

        return hash.digest('hex').slice(0, 12);
    }

    for(path: RelativePath): Preset {
        const scopes = this.scopes(dirname(path));

        const proxy: Hash = new Proxy(
            {},
            {
                has(_target, prop: string) {
                    for (const scope of scopes) {
                        if (own(scope, prop)) {
                            return true;
                        }
                    }

                    return false;
                },

                get(_target, prop: string) {
                    for (const scope of scopes) {
                        if (own(scope, prop)) {
                            return scope[prop];
                        }
                    }

                    // @ts-ignore
                    if (typeof Object.prototype[prop] === 'function') {
                        // @ts-ignore
                        return Object.prototype[prop].bind(proxy);
                    }

                    return undefined;
                },

                getOwnPropertyDescriptor(_target, prop: string) {
                    for (const scope of scopes) {
                        if (own(scope, prop)) {
                            return {configurable: true, enumerable: true, value: scope[prop]};
                        }
                    }

                    return undefined;
                },

                ownKeys() {
                    const keys = [];

                    for (const scope of scopes) {
                        keys.push(...Object.keys(scope));
                    }

                    return uniq(keys);
                },
            },
        );

        return proxy;
    }

    dump(presets: Hash): string {
        return dump(presets, {
            lineWidth: 120,
        });
    }

    private async load(path: RelativePath): Promise<Hash> {
        const file = normalizePath(path);

        this.logger.proc(file);

        return getHooks(this).PresetsLoaded.promise(
            load((await this.run.read(join(this.run.input, file))) || '{}') as Presets,
            file,
        );
    }

    @memoize('path')
    private scopes(path: RelativePath) {
        const paths = this.paths(path);

        return [this.config.vars].concat(
            paths.map((path) => {
                const [dir, preset] = path.split('#') as [NormalizedPath, string];

                return this.presets[dir][preset];
            }),
        );
    }

    @memoize('path')
    private paths(path: RelativePath) {
        const varsPreset = this.config.varsPreset || 'default';
        const paths = [];
        const dirs = [normalizePath(path)];

        while (dirs.length) {
            const dir = dirs.pop() as NormalizedPath;

            if (this.presets[dir]) {
                const defaults = this.presets[dir]['default'];
                const overrides = this.presets[dir][varsPreset];

                if (overrides && !isEmpty(overrides)) {
                    paths.push(`${dir}#${varsPreset}`);
                }

                if (varsPreset !== 'default' && defaults && !isEmpty(defaults)) {
                    paths.push(`${dir}#default`);
                }
            }

            const next = normalizePath(dirname(dir));
            if (dir !== next) {
                dirs.push(next);
            }
        }

        return paths;
    }
}
