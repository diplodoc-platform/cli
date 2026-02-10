import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';

import url from 'url';
import {bold} from 'chalk';
import {basename, dirname, isAbsolute, join} from 'node:path';

import {normalizePath} from '~/core/utils';
import {STATIC_ASSETS_FOLDER} from '~/constants';

import {walkLinks} from '../utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;

export function isStaticAssetPath(file: string): boolean {
    return (
        file.startsWith(`${STATIC_ASSETS_FOLDER}/`) || file.includes(`/${STATIC_ASSETS_FOLDER}/`)
    );
}

type Options = {
    path: NormalizedPath;
    log: Logger;
    titles: Record<NormalizedPath, Hash<string>>;
    entries: NormalizedPath[];
    existsInProject: (path: NormalizedPath) => boolean;
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            const {path, log, entries, existsInProject} = opts;

            if (!href) {
                log.error(`Empty link in ${bold(path)}`);
                return;
            }

            const parsed = url.parse(href);
            const {pathname} = parsed;

            if (isAbsolute(href) || href.includes('//')) {
                return;
            }

            const file = normalizePath(
                pathname ? join(dirname(state.env.path || path), pathname) : path,
            );

            const isStaticAsset = isStaticAssetPath(file);

            if (isStaticAsset) {
                if (!existsInProject(file)) {
                    link.attrSet('YFM003', 'missing-asset');
                }

                link.attrSet('href', url.format({...parsed, pathname: file}));
                link.attrSet('download', basename(file));
                return;
            }

            if (pathname && PAGE_LINK_REGEXP.test(pathname)) {
                const fileMissingInProject = !existsInProject(file);
                const fileMissingInToc = !entries.includes(file);

                if (fileMissingInProject || fileMissingInToc) {
                    link.attrSet('YFM003', 'missing-in-toc');
                }
            }

            link.attrSet(
                'href',
                url.format({
                    ...parsed,
                    pathname: file.replace(PAGE_LINK_REGEXP, '.html'),
                }),
            );
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;
