import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {dirname, isAbsolute, join} from 'node:path';

import {walkLinks} from '../utils';
import {normalizePath} from '~/core/utils';
import { prettifyLink } from '~/commands/build/utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
    entries: NormalizedPath[];
    skipHtmlExtension: boolean;
    existsInProject: (path: NormalizedPath) => boolean;
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            const {path, log, entries, skipHtmlExtension, existsInProject} = opts;

            if (!href) {
                log.error(`Empty link in ${bold(path)}`);
                return;
            }

            const parsed = url.parse(href);
            const {pathname} = parsed;

            if (isAbsolute(href) || href.includes('//')) {
                return;
            }

            if (pathname && PAGE_LINK_REGEXP.test(pathname)) {
                const file = normalizePath(
                    pathname ? join(dirname(state.env.path || path), pathname) : path,
                );

                if (!existsInProject(file) || !entries.includes(file)) {
                    link.attrSet('YFM003', file);
                }
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

            const linkHref = link.attrGet('href');

            if (skipHtmlExtension && linkHref) {
                link.attrSet('href', prettifyLink(linkHref));
            }
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch (e) {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;
