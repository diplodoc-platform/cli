import {pick} from 'lodash';
import {type UrlWithStringQuery, parse} from 'node:url';

export function isExternalHref(href: string) {
    return /^(\w{1,10}:)?\/\//.test(href) || /^([+\w]{1,10}:)/.test(href);
}

const MEDIA_FORMATS = /\.(svg|png|gif|jpe?g|bmp|webp|ico)$/i;

// TODO: should we deprecate this?
const DOC_FORMATS = /\.(txt|pdf|docx|xlsx|vsd)$/i;

export function isMediaLink(link: string) {
    return MEDIA_FORMATS.test(link) || DOC_FORMATS.test(link);
}

type LocalUrlInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
};

export function parseLocalUrl<T = LocalUrlInfo>(url: string | undefined) {
    if (!url || isExternalHref(url)) {
        return null;
    }

    try {
        const parsed = parse(url);

        if (parsed.host || parsed.protocol) {
            return null;
        }

        return pick(parsed, ['path', 'search', 'hash']) as T;
    } catch {
        return null;
    }
}
