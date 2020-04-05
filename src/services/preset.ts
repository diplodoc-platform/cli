import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {ArgvService} from './index';
import {DocPreset, YfmPreset} from '../models';


const storage: Map<string, YfmPreset> = new Map();

function add(path: string, audience: string) {
    const {input: inputFolderPath} = ArgvService.getConfig();
    const pathToPresetFile = resolve(inputFolderPath, path);

    const content = readFileSync(pathToPresetFile, 'utf8');
    const parsedPreset: DocPreset = safeLoad(content);

    const combinedValues: YfmPreset = {
        ...parsedPreset.default || {},
        ...parsedPreset[audience] || {}
    };
    storage.set(dirname(path), combinedValues);
}

function get(path: string): YfmPreset {
    let combinedValues: YfmPreset = {};

    while (path !== '.') {
        const presetValues: YfmPreset = storage.get(path) || {};
        path = dirname(path);

        combinedValues = {
            ...presetValues,
            ...combinedValues,
        };
    }

    return combinedValues;
}

function getAll() {
    return Object.fromEntries(storage);
}

export default {
    add,
    get,
    getAll,
};
