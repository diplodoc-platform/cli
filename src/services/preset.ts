import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {ArgvService} from './index';
import {DocPreset, YfmPreset} from '../models';

const presetStorage: Map<string, YfmPreset> = new Map();

function add(path: string, varsPreset: string) {
    const {input: inputFolderPath} = ArgvService.getConfig();
    const pathToPresetFile = resolve(inputFolderPath, path);

    const content = readFileSync(pathToPresetFile, 'utf8');
    const parsedPreset: DocPreset = safeLoad(content);

    const combinedValues: YfmPreset = {
        ...parsedPreset.default || {},
        ...parsedPreset[varsPreset] || {},
    };

    const key = dirname(path);
    presetStorage.set(key, combinedValues);
}

function get(path: string): YfmPreset {
    let combinedValues: YfmPreset = {};
    let localPath = path;

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

export default {
    add,
    get,
};
