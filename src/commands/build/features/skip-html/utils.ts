import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';

import url from 'url';
import {filterTokens} from '~/core/utils';

import skipHtmlLinks from './plugins/skipHtmlLinks';

export function getBaseMdItPlugins() {
    return [
        skipHtmlLinks,
    ];
}

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
            const tokenClass = link.attrGet('class');
            const href = getHrefTokenAttr(link);
            const {pathname, hash} = url.parse(href);

            /*  Don't process anchor links */
            const isYfmAnchor = tokenClass ? tokenClass.includes('yfm-anchor') : false;

            if (isYfmAnchor || !(pathname || hash)) {
                return;
            }

            handler(link, href, childrenTokens, index);
        });
    });
}

export function prettifyLink(href: string): string {
    const filename = href.split('/').pop() ?? '';
    
    let prettyFilename = filename;

    if (filename === 'index.html') {
        prettyFilename = '';
    } else if (filename.endsWith('.html') && filename !== 'index.html') {
        prettyFilename = filename.slice(0, -5);
    } else {
        prettyFilename = filename;
    }

    if (prettyFilename !== '') {
        return href.replace(/[^/]+$/, prettyFilename);
    } else {
        return href.replace(/[^/]+$/, '');
    }
}
