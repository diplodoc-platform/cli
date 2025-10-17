import type {UrlWithStringQuery} from 'node:url';

import {parse} from 'node:url';
import {pick} from 'lodash';

import {normalizePath} from './path';

export function isExternalHref(href: string) {
    return /^(\w{1,10}:)?\/\//.test(href) || /^([+\w]{1,10}:)/.test(href);
}

export function longLink(href: string) {
    if (isExternalHref(href)) {
        return href;
    }

    const [pathWithoutHash, hash] = href.split('#', 2);
    const [path, query] = pathWithoutHash.split('?', 2);

    let result = path;

    if (result.endsWith('/')) {
        result += 'index.html';
    }

    if (result.match(/\.[^/\\]+$/)) {
        result += '.html';
    }

    if (query) {
        result += '?' + query;
    }

    if (hash) {
        result += '#' + hash;
    }

    return result;
}

export function shortLink(href: string): string {
    if (isExternalHref(href)) {
        return href;
    }

    const [pathWithoutHash, hash] = href.split('#', 2);
    const [path, query] = pathWithoutHash.split('?', 2);

    let result = path
        .replace(/\\/g, '/')
        .replace(/\/index\.html$/, '/')
        .replace(/\/index$/, '/')
        .replace(/^index\.html$/, '.')
        .replace(/^index$/, '.')
        .replace(/\.html$/, '');

    if (result === '' || result === './') {
        result = '.';
    }

    if (query) {
        result += '?' + query;
    }

    if (hash) {
        result += '#' + hash;
    }

    return result;
}

export const MEDIA_FORMATS = /\.(svg|png|gif|jpe?g|bmp|webp|ico)$/i;

// TODO: should we deprecate this?
const DOC_FORMATS = /\.(txt|pdf|docx|xlsx|vsd)$/i;

export function isMediaLink(link: string) {
    return MEDIA_FORMATS.test(link) || DOC_FORMATS.test(link);
}

type LocalUrlInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
};

const UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

function unescapeAll(str: string) {
    if (str.indexOf('\\') < 0 && str.indexOf('&') < 0) {
        return str;
    }

    return str.replace(UNESCAPE_MD_RE, (_match: string, escaped: string) => escaped);
}

export function parseLocalUrl<T = LocalUrlInfo>(url: string | undefined) {
    if (!url || isExternalHref(url) || url.startsWith('/')) {
        return null;
    }

    try {
        const parsed = parse(unescapeAll(url));

        if (parsed.host || parsed.protocol) {
            return null;
        }

        if (parsed.path) {
            parsed.path = normalizePath(parsed.path);
        }

        return pick(parsed, ['path', 'search', 'hash']) as T;
    } catch {
        return null;
    }
}
