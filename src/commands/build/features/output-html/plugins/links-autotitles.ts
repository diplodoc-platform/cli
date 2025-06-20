import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {dirname, join} from 'node:path';

import {walkLinks} from '../utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href, tokens, idx) => {
            const {path, _, titles} = opts;
            const nextToken = tokens[idx + 1];

            const isEmptyLink = nextToken.type === 'link_close';
            const isTitleRefLink = nextToken.type === 'text' && nextToken.content === '{#T}';
            const {pathname, hash} = url.parse(href);
            const file = pathname ? join(dirname(state.env.path || path), pathname) : path;
            const isPageFile = PAGE_LINK_REGEXP.test(file);

            if ((!isEmptyLink && !isTitleRefLink) || !isPageFile) {
                return;
            }

            if (!(file in titles)) {
                return;
            }

            const title = titles[file][hash || '#'];

            if (typeof title === 'string') {
                const titleToken = isEmptyLink ? new state.Token('text', '', 0) : nextToken;
                titleToken.content = title;
                tokens.splice(idx + 1, isEmptyLink ? 0 : 1, titleToken);
            } else {
                link.attrSet('YFM010', `Title not found: ${bold(href)} in ${bold(path)}`);
                // log.warn(`Title not found: ${bold(href)} in ${bold(path)}`);
            }
        });
    };

    try {
        md.core.ruler.before('links', 'links-autotitles', plugin);
    } catch (e) {
        md.core.ruler.push('links-autotitles', plugin);
    }
}) as MarkdownItPluginCb<Options>;
