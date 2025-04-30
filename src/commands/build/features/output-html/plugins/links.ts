import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {dirname, isAbsolute, join} from 'node:path';

import {walkLinks} from '../utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            const {path, log} = opts;

            if (!href) {
                log.error(`Empty link in ${bold(path)}`);
                return;
            }

            const parsed = url.parse(href);
            const {pathname} = parsed;

            if (isAbsolute(href) || href.includes('//')) {
                return;
            }

            link.attrSet(
                'href',
                url.format({
                    ...parsed,
                    pathname: pathname
                        ? join(dirname(path), pathname.replace(PAGE_LINK_REGEXP, '.html'))
                        : path.replace(PAGE_LINK_REGEXP, '.html'),
                }),
            );
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch (e) {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;
