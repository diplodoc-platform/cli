import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {EntryData, PageData} from '~/commands/build';

import url from 'url';
import {filterTokens, isExternalHref, prettifyLink} from '~/core/utils';

export function getHrefTokenAttr(token: Token) {
    const href = token.attrGet('href') || '';
    try {
        return decodeURI(href);
    } catch (e) {}

    return href;
}

type LinkWalker = (link: Token, href: string, tokens: Token[], index: number) => void;

export function walkLinks(state: StateCore, handler: LinkWalker) {
    filterTokens(state.tokens, 'inline', (inline) => {
        const childrenTokens = inline.children || [];

        filterTokens(childrenTokens, 'link_open', (link, {index}) => {
            const href = getHrefTokenAttr(link);
            const {pathname, hash} = url.parse(href);

            if (!(pathname || hash)) {
                return;
            }

            handler(link, href, childrenTokens, index);
        });
    });
}

export function getHref(href: string) {
    if (isExternalHref(href)) {
        return href;
    }

    return prettifyLink(href);
}

function mapHeadings(headings: any) {
    return headings.map((heading: any) => {
        const newHeading = {...heading};

        if (newHeading.href) {
            newHeading.href = prettifyLink(newHeading.href);
        }

        if (Array.isArray(newHeading.items)) {
            newHeading.items = mapHeadings(newHeading.items);
        }

        return newHeading;
    });
}

export function getStateData(entry: EntryData): PageData {
    if (entry.type === 'yaml') {
        return {
            leading: true,
            data: entry.content.data,
            meta: entry.meta,
            title: entry.content.data.title || entry.meta.title || '',
        };
    } else {
        const prettifiedHeadings = mapHeadings(entry.info.headings);

        return {
            leading: false,
            html: entry.content.toString(),
            meta: entry.meta,
            headings: prettifiedHeadings,
            title: entry.info.title || entry.meta.title || '',
        };
    }
}
