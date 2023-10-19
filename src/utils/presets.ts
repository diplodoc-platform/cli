import {dirname, relative, resolve} from 'path';
import {isEmpty} from 'lodash';

import {ArgvService, PresetService} from '../services';
import {CacheService} from '../services/cache';

export function getVarsPerFile(filePath: string): Record<string, string> {
    const {vars: argVars} = ArgvService.getConfig();

    return {
        ...PresetService.get(dirname(filePath)),
        ...argVars,
    };
}

export function getVarsPerFileWithHash(filePath: string): {
    varsHashList: string[];
    vars: Record<string, string>;
} {
    const {vars: argVars} = ArgvService.getConfig();

    const {vars, varsHashList} = PresetService.getWithHash(dirname(filePath));

    if (!isEmpty(argVars)) {
        varsHashList.push(CacheService.getObjHash(argVars));
        Object.assign(vars, argVars);
    }

    return {vars, varsHashList};
}

export function getVarsPerRelativeFile(filePath: string): Record<string, string> {
    const {input} = ArgvService.getConfig();
    const root = resolve(input);
    const relativeFilePath = relative(root, filePath);

    return getVarsPerFile(relativeFilePath);
}
