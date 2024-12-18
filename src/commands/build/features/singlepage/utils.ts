function dropExt(path: string) {
    return path.replace(/\.(md|ya?ml|html)$/i, '');
}

// TODO: check that this is useless
function toUrl(path: string) {
    // replace windows backslashes
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function getAnchorId(tocDir: string, path: string) {
    const [pathname, hash] = path.split('#');
    const url = toUrl(dropExt(pathname)) + (hash ? '#' + hash : '');

    // TODO: encodeURIComponent will be best option
    return relativeTo(tocDir, url.replace(/\.\.\/|[/#]/g, '_'));
}

function relativeTo(root: string, path: string) {
    root = toUrl(root);
    path = toUrl(path);

    if (root && path.startsWith(root + '/')) {
        path = path.replace(root + '/', '');
    }

    return path;
}

export function getSinglePageUrl(tocDir: string, path: string) {
    const prefix = toUrl(tocDir) || '.';
    const suffix = getAnchorId(tocDir, path);

    if (prefix === '.') {
        return '#' + suffix;
    }

    return prefix + '/single-page.html#' + suffix;
}
