import {pick} from 'lodash';
import {type UrlWithStringQuery, parse} from 'url';

export function isExternalHref(href: string) {
    return /^(\w{1,10}:)?\/\//.test(href);
}

const MEDIA_FORMATS = /\.(svg|png|gif|jpe?g|bmp|webp|ico)$/i;

export function isMediaLink(link: string) {
    return MEDIA_FORMATS.test(link);
}

type LocalUrlInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
};

export function parseLocalUrl<T = LocalUrlInfo>(url: string | undefined) {
    if (!url || isExternalHref(url)) {
        return null;
    }

    const parsed = parse(url);

    if (parsed.host || parsed.protocol) {
        return null;
    }

    return pick(parsed, ['path', 'search', 'hash']) as T;
}

type LinkInfo = [string, [number, number]];

export function findLinks<T extends boolean>(
    content: string,
    withPosition?: T,
): T extends true ? LinkInfo[] : string[] {
    const links = [];

    // This is not significant which type of content (image or link) we will match.
    // Anyway we need to copy linked local media content.
    const ASSETS_CONTENTS = /]\(\s*(.+?(\([^(]*?\))?)+?\s*\)/gi;
    // Backward search is payful syntax. So we can't use it on large texts.
    const ASSET_LINK = /(?<=]\(\s*)[^\s]+(?=.*?\))/;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = ASSETS_CONTENTS.exec(content))) {
        // replace is related to parseLinkDestination from markdown-it
        const link = (match[0].match(ASSET_LINK)?.[0] || '').replace(/\\/g, '');
        const info = withPosition
            ? ([link, [match.index, ASSETS_CONTENTS.lastIndex]] as LinkInfo)
            : link;
        if (link) {
            links.push(info);
        }
    }

    return links as T extends true ? LinkInfo[] : string[];
}
