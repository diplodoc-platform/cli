import {dirname} from 'path';
import {merge} from 'lodash';

import {DocPreset, YfmPreset} from '../models';

const presetStorage: Map<string, YfmPreset> = new Map();

function add(parsedPreset: DocPreset, path: string, varsPreset: string) {
    const combinedValues: YfmPreset = merge(
        parsedPreset.default || {},
        parsedPreset[varsPreset] || {},
    );

    const key = dirname(path);
    presetStorage.set(key, combinedValues);
}

function get(path: string): YfmPreset {
    let combinedValues: YfmPreset = {};
    let localPath = path;

    while (localPath !== '.') {
        const presetValues: YfmPreset = presetStorage.get(localPath) || {};
        localPath = dirname(localPath);

        combinedValues = merge(presetValues, combinedValues);
    }

    // Add root' presets
    combinedValues = merge(
        presetStorage.get('.'),
        combinedValues,
    );

    return combinedValues;
}

export default {
    add,
    get,
};
