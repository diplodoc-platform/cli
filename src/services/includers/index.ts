import {join} from 'path';

import {isObject} from 'lodash';

import {ArgvService} from '../index';
import {IncludeMode} from '../../constants';
import {logger} from '../../utils/logger';
import {generic, sourcedocs, openapi} from './batteries';

import type {
    Includer,
    YfmToc,
    YfmTocInclude,
    YfmTocIncluder,
    YfmTocIncluders,
    YfmTocIncluderObject,
    YfmTocIncludersNormalized,
} from '../../models';

const includerUsage = `include:
  path: <path-where-to-include>
  includer:
    name: <includer-name>
    <includer-parameter>: <value-for-includer-parameter>
`;

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

    includersMap = {generic, sourcedocs, openapi};

    for (const includer of custom) {
        includersMap[includer.name] = includer;
    }
}

async function applyIncluders(path: string, item: YfmToc) {
    if (!(item && item.include) || !includeHasIncluders(item.include)) {
        return;
    }

    if (!includeValid(item.include)) {
        throw new IncludersError('include doesn\'t comply with includers standard', path);
    }

    // normalize include mode (includers support link mode only)
    item.include.mode = IncludeMode.LINK;

    const includers = normalizeIncludeIncluders(path, item.include) as YfmTocIncludersNormalized;

    item.include.includers = includers;

    let index = 0;

    for (const {name, ...rest} of includers) {
        const includer = getIncluder(name);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const passedParams: Record<string, any> = {
            ...rest,
        };

        await applyIncluder({path, item, includer, passedParams, index});
    }

    // contract to be fullfilled by the includer:
    // provide builder generated toc.yaml
    item.include.path = join(item.include.path, 'toc.yaml');
    index++;
}

function includeHasIncluders(include: YfmTocInclude) {
    return include.includer || include.includers;
}

function includeValid(include: YfmTocInclude) {
    return (include.mode === IncludeMode.LINK || !include.mode) && include.path?.length;
}

function normalizeIncludeIncluders(path: string, include: YfmTocInclude) {
    if (include.includers) {
        const {status, message} = includersValid(include.includers);

        if (status) {
            return include.includers;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        throw new IncludersError(message!, path);
    }

    logger.warn(path, 'includer field is getting depricated, use includers field\n' + includersUsage);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const {status, message} = includerValid(include.includer!);

    if (status) {
        return [include.includer];
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    throw new IncludersError(message!, path);
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
    if (Array.isArray(includer)) {
        return {status: false, message: `use includers field to provide multiple includers:\n${includersUsage}`};
    }

    if (typeof includer === 'string') {
        return {status: false, message: `use updated includer format:\n${includerUsage}`};
    }

    if (isObject(includer)) {
        if (typeof includer.name !== 'string') {
            return {
                status: false,
                message: 'use string to specify includers name',
            };
        }

        if (includerExists(includer)) {
            return {status: true};
        }

        return {status: false, message: `includer ${includer.name} not implemented`};
    }

    return {
        status: false,
        message: `use appropriate includer/includers format:\n${includerUsage}${includersUsage}`,
    };
}

function getIncluder(includerName: string) {
    return includersMap[includerName];
}

function includerExists(includer: YfmTocIncluderObject) {
    return includersMap[includer.name as keyof typeof includersMap];
}

export type applyIncluderParams = {
    path: string;
    item: YfmToc;
    includer: Includer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    passedParams: Record<string, any>;
    index: number;
};

async function applyIncluder(args: applyIncluderParams) {
    const {rootInput: readBasePath, input: writeBasePath} = ArgvService.getConfig();

    const {path, item, includer, passedParams, index} = args;

    const params = {
        tocPath: path,
        passedParams,
        index,
        item,
        readBasePath,
        writeBasePath,
    };

    return await includer.includerFunction(params);
}

export {init, applyIncluders, IncludersError};
