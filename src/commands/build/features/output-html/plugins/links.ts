import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {dirname, isAbsolute, join} from 'node:path';

import {filterTokens, isExternalHref} from '~/core/utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
};

function processLink(state: StateCore, tokens: Token[], idx: number, opts: Options) {
    const {path, log, titles} = opts;

    const linkToken = tokens[idx];
    const nextToken = tokens[idx + 1];

    const isEmptyLink = nextToken.type === 'link_close';
    const isTitleRefLink = nextToken.type === 'text' && nextToken.content === '{#T}';

    const href = getHrefTokenAttr(linkToken);

    if (!href) {
        log.error(`Empty link in ${bold(path)}`);
        return;
    }

    if (isExternalHref(href)) {
        linkToken.attrSet('target', '_blank');
        linkToken.attrSet('rel', 'noreferrer noopener');
        return;
    }

    const {pathname, hash} = url.parse(href);

    if (!pathname && !hash) {
        return;
    }

    const file = pathname ? join(dirname(state.env.path || '.'), pathname) : path;
    const isPageFile = PAGE_LINK_REGEXP.test(file);

    if ((isEmptyLink || isTitleRefLink) && file in titles && isPageFile) {
        const title = titles[file][hash || '#'];

        if (typeof title === 'string') {
            const titleToken = isEmptyLink ? new state.Token('text', '', 0) : nextToken;
            titleToken.content = title;
            tokens.splice(idx + 1, isEmptyLink ? 0 : 1, titleToken);
        } else {
            log.warn(`Title not found: ${bold(href)} in ${bold(path)}`);
        }
    }

    if (!isAbsolute(href) && !href.includes('//')) {
        linkToken.attrSet(
            'href',
            url.format({
                ...url.parse(href),
                pathname:
                    pathname
                        ? join(dirname(path), pathname.replace(PAGE_LINK_REGEXP, '.html'))
                        : path.replace(PAGE_LINK_REGEXP, '.html'),
            }),
        );
    }
}

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        const tokens = state.tokens;

        filterTokens(tokens, 'inline', (inline) => {
            const childrenTokens = inline.children || [];

            filterTokens(childrenTokens, 'link_open', (link, {index}) => {
                const tokenClass = link.attrGet('class');

                /*  Don't process anchor links */
                const isYfmAnchor = tokenClass ? tokenClass.includes('yfm-anchor') : false;

                if (!isYfmAnchor) {
                    processLink(state, childrenTokens, index, opts);
                }
            });
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch (e) {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;

function getHrefTokenAttr(token: Token) {
    const href = token.attrGet('href') || '';
    try {
        return decodeURI(href);
    } catch (e) {}

    return href;
}
