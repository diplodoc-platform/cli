import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {Heading} from '@diplodoc/transform/lib/typings';

import url from 'url';

import {filterTokens, isExternalHref, shortLink} from '~/core/utils';

export function getHrefTokenAttr(token: Token) {
    const href = token.attrGet('href') || '';
    try {
        return decodeURI(href);
    } catch {}

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

    return shortLink(href);
}

export function mapHeadings(headings: Heading[] | undefined) {
    if (!headings) {
        return;
    }

    return headings.map((heading: Heading) => {
        const newHeading = {...heading};

        if (newHeading.href) {
            newHeading.href = shortLink(newHeading.href);
        }

        if (Array.isArray(newHeading.items)) {
            newHeading.items = mapHeadings(newHeading.items);
        }

        return newHeading;
    });
}
