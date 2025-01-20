import {join} from 'node:path';
import {normalizePath} from '~/core/utils';

function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

function getAnchorId(tocDir: string, path: string) {
    const [pathname, hash] = path.split('#');
    const url = normalizePath(dropExt(pathname)) + (hash ? '#' + hash : '');

    // TODO: encodeURIComponent will be best option
    return relativeTo(tocDir, url.replace(/\.\.\/|[/#]/g, '_'));
}

function relativeTo(root: string, path: string) {
    root = normalizePath(root);
    path = normalizePath(path);

    if (root && path.startsWith(root + '/')) {
        path = path.replace(root + '/', '');
    }

    return path;
}

export function getSinglePageUrl(tocDir: string, path: string): NormalizedPath {
    const prefix = normalizePath(tocDir) || '.';
    const suffix = getAnchorId(tocDir, path);

    if (prefix === '.') {
        return ('#' + suffix) as NormalizedPath;
    }

    return normalizePath(join(prefix, 'single-page.html#' + suffix));
}
