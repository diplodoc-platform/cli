import {formatHref, parseHref} from '@diplodoc/utils';
import {cloneDeepWith, isString} from 'lodash';

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

const DOC_FORMATS = /\.(txt|ya?ml|docx|xlsx|pptx|pdf|csv)$/i;

export function isMediaLink(link: string) {
    return MEDIA_FORMATS.test(link) || DOC_FORMATS.test(link);
}

type LocalUrlInfo = {
    hash: string | null;
    search: string | null;
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
        const {pathname, search, hash} = parseHref(unescapeAll(url));

        const path = pathname === null ? null : normalizePath(formatHref({pathname, search}));

        return {path, search, hash} as T;
    } catch {
        return null;
    }
}

export const LINK_KEYS_LEADING_CONFIG = ['href'];
export const LINK_KEYS_PAGE_CONSTRUCTOR_CONFIG = [
    'src',
    'url',
    'href',
    'icon',
    'image',
    'desktop',
    'mobile',
    'tablet',
    'previewImg',
    'image',
    'avatar',
    'logo',
    'light',
    'dark',
];

export const LINK_KEYS = [
    ...new Set([...LINK_KEYS_LEADING_CONFIG, ...LINK_KEYS_PAGE_CONSTRUCTOR_CONFIG]),
];

export function walkLinks(object: object, modify: (value: string) => string | void) {
    // Clone the object deeply with a customizer function that modifies matching keys
    return cloneDeepWith(object, (value: unknown, key) => {
        if (LINK_KEYS.includes(key as string) && isString(value)) {
            return modify(value);
        }

        return undefined;
    });
}
