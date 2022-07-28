import {sourcedocs} from './batteries';
import {Includer, YfmTocInclude} from '../../models';

type IncludersMap = {[key: string]: Includer};

let includersMap!: IncludersMap;

function init(custom: Includer[] = []) {
    if (includersMap) { return; }

    includersMap = {
        sourcedocs,
    };

    for (const includer of custom) {
        includersMap[includer.name] = includer;
    }
}

const isValidIncluder = (include: YfmTocInclude) =>
        include?.path?.length && include?.includer && includersMap[include.includer as keyof typeof includersMap];

const getIncluder = (include: YfmTocInclude) => {
    if (isValidIncluder(include)) { return includersMap[include.includer as keyof typeof includersMap]; }

    throw new Error('includer not implemented');
};

export {init, isValidIncluder, getIncluder};
