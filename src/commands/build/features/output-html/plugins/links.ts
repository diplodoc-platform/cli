import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {dirname, isAbsolute, join} from 'node:path';

import {walkLinks} from '../utils';
import {normalizePath} from '~/core/utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
    entries: NormalizedPath[];
    existsInProject: (path: NormalizedPath) => boolean;
    linkLogLevel?: 'error' | 'warn';
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            const {path, log, entries, existsInProject, linkLogLevel = 'error'} = opts;

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

                if (!existsInProject(file)) {
                    log[linkLogLevel](
                        `Link is unreachable: ${bold(file)} in ${bold(path)}. File does not exists in project.`,
                    );
                    return;
                }

                if (!entries.includes(file)) {
                    log.warn(
                        `Link is unreachable: ${bold(file)} in ${bold(path)}. All files must be listed in toc files.`,
                    );
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
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch (e) {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;
