import {dirname, relative, resolve} from 'path';

import {ArgvService, PresetService} from '../services';
import {YfmPreset} from '../models';

export function getVarsPerFile(filePath: string): YfmPreset {
    const {vars: argVars} = ArgvService.getConfig();

    const result = {
        ...PresetService.get(dirname(filePath)),
        ...argVars,
    };

    return result;
}

export function getVarsPerRelativeFile(filePath: string): Record<string, string> {
    const {input} = ArgvService.getConfig();
    const root = resolve(input);
    const relativeFilePath = relative(root, filePath);

    return getVarsPerFile(relativeFilePath);
}
