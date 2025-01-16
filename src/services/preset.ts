import {dirname, normalize} from 'path';

import {YfmPreset} from '../models';
import {VarsService} from '~/core/vars';

export type PresetStorage = Map<string, YfmPreset>;

let presetStorage: PresetStorage = new Map();

function init(vars: VarsService) {
    for (const [path, values] of vars.entries) {
        presetStorage.set(dirname(path), values);
    }
}

function get(path: string): YfmPreset {
    let vars = presetStorage.get(normalize(path));
    while (!vars) {
        path = dirname(path);
        vars = presetStorage.get(normalize(path));

        if (path === '.') {
            break;
        }
    }

    return vars || {};
}

function getPresetStorage(): Map<string, YfmPreset> {
    return presetStorage;
}

function setPresetStorage(preset: Map<string, YfmPreset>): void {
    presetStorage = preset;
}

export default {
    init,
    get,
    getPresetStorage,
    setPresetStorage,
};
