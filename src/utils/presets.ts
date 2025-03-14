import {relative} from 'path';

import {normalizePath} from '~/core/utils';
import {ArgvService, PresetService} from '../services';
import {YfmPreset} from '../models';

export function getVarsPerFile(filePath: RelativePath): YfmPreset {
    return PresetService.get(normalizePath(filePath));
}

export function getVarsPerRelativeFile(filePath: string): Record<string, string> {
    const {input} = ArgvService.getConfig();
    const relativeFilePath = relative(input, filePath);

    return getVarsPerFile(relativeFilePath);
}
