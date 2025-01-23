import {isAbsolute, normalize} from 'node:path';
import _normalizePath from 'normalize-path';

import {isExternalHref} from '~/core/utils/url';

export function normalizePath(path: string): NormalizedPath {
    return _normalizePath(normalize(_normalizePath(path, false)), false);
}

export function isRelativePath(path: string): path is RelativePath {
    return !isExternalHref(path) && !isAbsolute(path);
}
