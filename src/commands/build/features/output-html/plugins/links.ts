import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type Token from 'markdown-it/lib/token';
import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Logger} from '~/core/logger';
import type {AnchorIndex, ResolveAnchorPage} from '~/commands/build/services/anchors';

import {formatHref, parseHref} from '@diplodoc/utils';
import {bold} from 'chalk';
import {dirname, isAbsolute, join} from 'node:path';

import {isExternalHref, normalizePath} from '~/core/utils';

import {walkLinks} from '../utils';

const PAGE_LINK_REGEXP = /\.(md|ya?ml)$/i;
const DOC_ASSETS_FOLDER = '_assets';

type Options = {
    path: NormalizedPath;
    log: Logger;
    entries: NormalizedPath[];
    existsInProject: (path: NormalizedPath) => boolean;
    anchorIndex?: AnchorIndex;
    resolveAnchorPage: ResolveAnchorPage;
};

export default ((md, opts) => {
    const plugin = (state: StateCore) => {
        walkLinks(state, (link, href) => {
            // Skip already processed links to avoid double-resolution
            // (e.g. when term plugin calls md.parse for popup content,
            // links inside nested includes get processed during inner parse,
            // then the outer parse would incorrectly re-resolve them)
            if (link.meta?.linksPluginProcessed) {
                return;
            }

            const {path, log, entries, existsInProject, anchorIndex, resolveAnchorPage} = opts;

            if (!href) {
                log.error(`Empty link in ${bold(path)}`);
                return;
            }

            if (isAbsolute(href) || isExternalHref(href) || href.includes('//')) {
                return;
            }

            const parsed = parseHref(href);
            const {pathname} = parsed;

            const isAssetsLink = pathname && pathname.startsWith(`${DOC_ASSETS_FOLDER}/`);
            const hasDownloadAttr = link.attrGet('download') !== null;

            if ((isAssetsLink || hasDownloadAttr) && pathname) {
                const fullAssetsPath = normalizePath(
                    join(dirname(state.env.path || path), pathname),
                );

                if (!existsInProject(fullAssetsPath)) {
                    link.attrSet('YFM003', 'file-not-found');
                }

                link.attrSet(
                    'href',
                    formatHref({
                        ...parsed,
                        pathname,
                    }),
                );
            } else {
                const file = normalizePath(
                    pathname ? join(dirname(state.env.path || path), pathname) : path,
                );

                if (pathname && PAGE_LINK_REGEXP.test(pathname)) {
                    const fileMissingInProject = !existsInProject(file);
                    const fileMissingInToc = !entries.includes(file);

                    if (fileMissingInProject || fileMissingInToc) {
                        link.attrSet('YFM003', 'missing-in-toc');
                    }
                }

                validateAnchor(link, file, parsed.hash, {
                    entries,
                    anchorIndex,
                    resolveAnchorPage,
                });

                link.attrSet(
                    'href',
                    formatHref({
                        ...parsed,
                        pathname: file.replace(PAGE_LINK_REGEXP, '.html'),
                    }),
                );
            }

            link.meta = link.meta || {};
            link.meta.linksPluginProcessed = true;
        });
    };

    try {
        md.core.ruler.before('includes', 'links', plugin);
    } catch {
        md.core.ruler.push('links', plugin);
    }
}) as MarkdownItPluginCb<Options>;

function validateAnchor(
    link: Token,
    file: NormalizedPath,
    hash: string | null,
    options: Pick<Options, 'entries' | 'anchorIndex' | 'resolveAnchorPage'>,
) {
    const {entries, anchorIndex, resolveAnchorPage} = options;
    const target = resolveAnchorPage(file);
    const anchor = hash?.slice(1);
    const targetAnchors = target ? anchorIndex?.get(target) : undefined;
    const targetIsReachable = target && entries.includes(target) && link.attrGet('YFM003') === null;

    if (anchor && targetIsReachable && targetAnchors && !targetAnchors.has(anchor)) {
        link.attrSet('YFM002', 'anchor-not-found');
    }
}
