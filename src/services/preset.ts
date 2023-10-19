import {dirname, normalize} from 'path';

import {DocPreset, YfmPreset} from '../models';

export type PresetStorage = {store: Map<string, YfmPreset>; hashMap: Map<string, string>};

let presetStorage: PresetStorage['store'] = new Map();
let presetStorageHash: PresetStorage['hashMap'] = new Map();

function add(parsedPreset: DocPreset, path: string, varsPreset: string, hash: string) {
    const combinedValues: YfmPreset = {
        ...(parsedPreset.default || {}),
        ...(parsedPreset[varsPreset] || {}),
    };

    const key = dirname(normalize(path));
    presetStorage.set(key, combinedValues);
    presetStorageHash.set(key, hash);
}

function get(path: string): YfmPreset {
    let combinedValues: YfmPreset = {};
    let localPath = normalize(path);

    while (localPath !== '.') {
        const presetValues: YfmPreset = presetStorage.get(localPath) || {};
        localPath = dirname(localPath);

        combinedValues = {
            ...presetValues,
            ...combinedValues,
        };
    }

    // Add root' presets
    combinedValues = {
        ...presetStorage.get('.'),
        ...combinedValues,
    };

    return combinedValues;
}

function getWithHash(path: string): {vars: YfmPreset; varsHashList: string[]} {
    const values: YfmPreset[] = [];
    const varsHashList: string[] = [];
    let localPath = normalize(path);

    const next = (place: string) => {
        const presetValues = presetStorage.get(place);
        const hash = presetStorageHash.get(place);
        if (presetValues && hash) {
            varsHashList.unshift(hash);
            values.unshift(presetValues);
        }
    };

    while (localPath !== '.') {
        next(localPath);
        localPath = dirname(localPath);
    }
    next(localPath);

    const combinedValues = Object.assign({}, ...values);

    return {vars: combinedValues, varsHashList};
}

function getPresetStorage(): PresetStorage {
    return {
        store: presetStorage,
        hashMap: presetStorageHash,
    };
}

function setPresetStorage(preset: PresetStorage): void {
    presetStorage = preset.store;
    presetStorageHash = preset.hashMap;
}

export default {
    add,
    get,
    getWithHash,
    getPresetStorage,
    setPresetStorage,
};
