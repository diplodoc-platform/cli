import {dirname} from 'node:path';

import {YfmPreset} from '../models';
import {normalizePath, own} from '~/core/utils';
import {uniq} from 'lodash';
import {ArgvService} from '~/services/index';

export type PresetStorage = Record<string, YfmPreset>;

let presetStorage: PresetStorage = {};

function init(presets: PresetStorage) {
    presetStorage = presets;
}

function get(path: RelativePath): YfmPreset {
    const scopes = _scopes(dirname(path));

    return new Proxy(
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
}

function _scopes(path: RelativePath) {
    const {vars, varsPreset} = ArgvService.getConfig();
    const presets = [vars];

    let dir = normalizePath(path);
    do {
        if (presetStorage[dir]) {
            presets.push(presetStorage[dir][varsPreset]);
            if (varsPreset !== 'default') {
                presets.push(presetStorage[dir]['default']);
            }
        }

        dir = normalizePath(dirname(dir));
    } while (dir && dir !== '.');

    return presets;
}

function setPresetStorage(preset: Record<string, YfmPreset>): void {
    presetStorage = preset;
}

export default {
    init,
    get,
    setPresetStorage,
};
