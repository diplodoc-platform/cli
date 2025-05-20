import {dirname, extname, isAbsolute, join, normalize} from 'node:path';
import _normalizePath from 'normalize-path';

import {isExternalHref} from '~/core/utils';

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

export function getDepth(path: string) {
    return path
        .replace(/\\/g, '/')
        .replace(/^\.\/|\/$/g, '')
        .split('/').length;
}

export function getDepthPath(depth: number) {
    return Array(depth).fill('../').join('') || './';
}

export function setExt<T extends AnyPath>(path: T, newext: string): T {
    newext = newext.startsWith('.') ? newext.slice(1) : newext;

    return (path.slice(0, -extname(path).length) + (newext ? '.' + newext : '')) as T;
}
