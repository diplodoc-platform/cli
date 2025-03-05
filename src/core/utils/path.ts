import {dirname, isAbsolute, join, normalize} from 'node:path';
import _normalizePath from 'normalize-path';

import {isExternalHref} from '~/core/utils/url';

export function normalizePath(path: string): NormalizedPath {
    return _normalizePath(normalize(_normalizePath(path, false)), false);
}

export function isRelativePath(path: string): path is RelativePath {
    return !isExternalHref(path) && !isAbsolute(path);
}

export function langFromPath(path: string, config: {lang?: string; langs: string[]}) {
    const {lang, langs} = config;
    const pathBaseLang = normalizePath(path).split('/')[0];
    const pathLang = langs.includes(pathBaseLang) && pathBaseLang;

    return pathLang || lang || langs[0];
}

export function rebasePath(root: RelativePath, path: RelativePath) {
    return normalizePath(join(dirname(root), path));
}

export function fullPath(
    path: AbsolutePath | NormalizedPath,
    root: NormalizedPath,
): NormalizedPath {
    if (path.match(/^(\/|\\)/)) {
        return normalizePath(path.slice(1));
    } else {
        return normalizePath(join(dirname(root), path));
    }
}
