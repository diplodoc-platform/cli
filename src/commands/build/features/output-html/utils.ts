import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';

import url from 'url';
import notes from '@diplodoc/transform/lib/plugins/notes';
import anchors from '@diplodoc/transform/lib/plugins/anchors';
import code from '@diplodoc/transform/lib/plugins/code';
import cut from '@diplodoc/transform/lib/plugins/cut';
import deflist from '@diplodoc/transform/lib/plugins/deflist';
import imsize from '@diplodoc/transform/lib/plugins/imsize';
import sup from '@diplodoc/transform/lib/plugins/sup';
import tabs from '@diplodoc/transform/lib/plugins/tabs';
import video from '@diplodoc/transform/lib/plugins/video';
import monospace from '@diplodoc/transform/lib/plugins/monospace';
import table from '@diplodoc/transform/lib/plugins/table';
import term from '@diplodoc/transform/lib/plugins/term';
import blockAnchor from '@diplodoc/transform/lib/plugins/block-anchor';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as openapi from '@diplodoc/openapi-extension';
import * as pageConstructor from '@diplodoc/page-constructor-extension';

import {filterTokens} from '~/core/utils';

import includes from './plugins/includes';
import includesDetect from './plugins/includes-detect';
import links from './plugins/links';
import linksAutotitles from './plugins/links-autotitles';
import linksExternal from './plugins/links-external';
import images from './plugins/images';
import {noTranslate} from '@diplodoc/translation';

export function getBaseMdItPlugins(skipHtmlExtension: boolean) {
    return [
        deflist,
        includes,
        includesDetect,
        cut,
        (md: any, opts: any) => links(md, { ...(opts || {}), skipHtmlExtension }),
        linksAutotitles,
        linksExternal,
        images,
        notes,
        anchors,
        tabs,
        code,
        imsize,
        sup,
        video,
        monospace,
        table,
        term,
        openapi.transform(),
        mermaid.transform({
            bundle: false,
            runtime: '_bundle/mermaid-extension.js',
        }),
        latex.transform({
            bundle: false,
            runtime: {
                script: '_bundle/latex-extension.js',
                style: '_bundle/latex-extension.css',
            },
        }),
        pageConstructor.transform({
            bundle: false,
            runtime: {
                script: '_bundle/page-constructor-extension.js',
                style: '_bundle/page-constructor-extension.css',
            },
        }),
        blockAnchor,
        noTranslate({mode: 'render'}),
    ];
}

// TODO(major): Deprecate
export function getCustomMdItPlugins() {
    try {
        const customPlugins = require(require.resolve('./plugins'));
        return Array.isArray(customPlugins) ? customPlugins : [];
    } catch (e) {
        return [];
    }
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
