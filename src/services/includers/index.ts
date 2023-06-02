import {join} from 'path';

import {isObject} from 'lodash';

import {ArgvService} from '../index';
import {IncludeMode} from '../../constants';
import {generic, sourcedocs, unarchive} from './batteries';

import type {
    YfmPreset,
    Includer,
    YfmToc,
    YfmTocInclude,
    YfmTocIncluder,
    YfmTocIncluders,
} from '../../models';

const includersUsage = `include:
  path: <path-where-to-include>
  includers:
    - name: <includer-name-0>
      <includer-parameter>: <value-for-includer-parameter>
    - name: <includer-name-1>
      <includer-parameter>: <value-for-includer-parameter>
`;

type IncludersMap = Record<string, Includer>;

let includersMap!: IncludersMap;

class IncludersError extends Error {
    path: string;

    constructor(message: string, path: string) {
        super(message);

        this.name = 'IncludersError';
        this.path = path;
    }
}

function init(custom: Includer[] = []) {
    if (includersMap) { return; }

    includersMap = {generic, sourcedocs, unarchive};

    for (const includer of custom) {
        includersMap[includer.name] = includer;
    }
}

async function applyIncluders(path: string, item: YfmToc, vars: YfmPreset) {
    if (!item.include?.includers) {
        return;
    }

    if (!includeValid(item.include)) {
        throw new IncludersError('include doesn\'t comply with includers standard', path);
    }

    // normalize include mode (includers support link mode only)
    item.include.mode = IncludeMode.LINK;

    const {status, message} = includersValid(item.include.includers);
    if (!status) {
        throw new IncludersError(message ?? '', path);
    }

    let index = 0;
    for (const {name, ...rest} of item.include.includers) {
        const includer = getIncluder(name);
        const passedParams = {...rest};

        await applyIncluder({path, item, includer, passedParams, index, vars});
    }

    // contract to be fullfilled by the includer:
    // provide builder generated toc.yaml
    item.include.path = join(item.include.path, 'toc.yaml');
    index++;
}

function includeValid(include: YfmTocInclude) {
    return (include.mode === IncludeMode.LINK || !include.mode) && include.path?.length;
}

function includersValid(includers: YfmTocIncluders) {
    for (const includer of includers) {
        const {status, message} = includerValid(includer);

        if (!status) {
            return {status, message};
        }
    }

    return {status: true};
}

function includerValid(includer: YfmTocIncluder) {
    if (isObject(includer)) {
        if (typeof includer.name !== 'string') {
            return {
                status: false,
                message: 'use string in the includer.name to specify includers name',
            };
        }

        if (includerExists(includer)) {
            return {status: true};
        }

        return {status: false, message: `includer ${includer.name} not implemented`};
    }

    return {
        status: false,
        message: `use appropriate includers format:\n${includersUsage}`,
    };
}

function getIncluder(includerName: string) {
    return includersMap[includerName];
}

function includerExists(includer: YfmTocIncluder) {
    return includersMap[includer.name as keyof typeof includersMap];
}

export type applyIncluderParams = {
    path: string;
    item: YfmToc;
    includer: Includer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passedParams: Record<string, any>;
    index: number;
    vars: YfmPreset;
};

async function applyIncluder(args: applyIncluderParams) {
    const {rootInput: readBasePath, input: writeBasePath} = ArgvService.getConfig();

    const {path, item, includer, passedParams, index, vars} = args;

    const params = {
        tocPath: path,
        passedParams,
        index,
        item,
        readBasePath,
        writeBasePath,
        vars,
    };

    return await includer.includerFunction(params);
}

export {init, applyIncluders, IncludersError};
