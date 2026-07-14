import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import {parseHref} from '@diplodoc/utils';
import {bold} from 'chalk';
import {dirname, join} from 'node:path';

import {normalizePath} from '~/core/utils';

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
            const {path, titles} = opts;
            const nextToken = tokens[idx + 1];

            const isEmptyLink = nextToken.type === 'link_close';
            const isTitleRefLink = nextToken.type === 'text' && nextToken.content === '{#T}';
            const {pathname, hash} = parseHref(href);
            const file = pathname ? join(dirname(state.env.path || path), pathname) : path;
            const normalizedFile = normalizePath(file);
            const isPageFile = PAGE_LINK_REGEXP.test(normalizedFile);

            if ((!isEmptyLink && !isTitleRefLink) || !isPageFile) {
                return;
            }

            if (!(normalizedFile in titles)) {
                link.attrSet('YFM010', `Title not found: ${bold(href)} in ${bold(path)}`);

                return;
            }

            const title = titles[normalizedFile][hash || '#'];

            if (typeof title === 'string') {
                const titleToken = isEmptyLink ? new state.Token('text', '', 0) : nextToken;
                titleToken.content = title;
                tokens.splice(idx + 1, isEmptyLink ? 0 : 1, titleToken);
            } else {
                link.attrSet('YFM010', `Title not found: ${bold(href)} in ${bold(path)}`);
            }
        });
    };

    try {
        md.core.ruler.before('links', 'links-autotitles', plugin);
    } catch {
        md.core.ruler.push('links-autotitles', plugin);
    }
}) as MarkdownItPluginCb<Options>;
