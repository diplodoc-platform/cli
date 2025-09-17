import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';
import type {Toc, TocItem} from '~/core/toc';

import {join} from 'node:path';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {normalizePath, own, prettifyLink} from '~/core/utils';

import {getHooks as getEntryHooks} from '../../services/entry';
import {options} from './config';
import {getHref, mapHeadings} from './utils';
import skipHtmlLinks from './plugins/skipHtmlLinks';

export type SkipHtmlArgs = {
    skipHtmlExtension: boolean;
};

export type SkipHtmlConfig = {
    skipHtmlExtension: boolean;
};

export class SkipHtml {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('SkipHtml', (command: Command) => {
            command.addOption(options.skipHtmlExtension);
        });

        getBaseHooks(program).Config.tap('SkipHtml', (config, args) => {
            config.skipHtmlExtension = defined('skipHtmlExtension', args, config) || false;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('SkipHtml', async (run) => {
                if (!run.config.skipHtmlExtension) {
                    return;
                }

                // Trim .html in TOC links
                getTocHooks(run.toc).Dump.tapPromise('SkipHtml', async (vfile) => {
                    await run.toc.walkItems([vfile.data as Toc], (item: Toc | TocItem) => {
                        if (own<string, 'href'>(item, 'href')) {
                            item.href = normalizePath(getHref(item.href));
                        }

                        return item;
                    });
                });

                // Trim .html in metadata
                getMetaHooks(run.meta).Dump.tap('SkipHtml', (meta) => {
                    if (meta.canonical) {
                        meta.canonical = prettifyLink(meta.canonical);
                    }

                    if (meta.alternate?.length) {
                        meta.alternate = meta.alternate.map((item) => ({
                            ...item,
                            href: prettifyLink(item.href),
                        }));
                    }

                    return meta;
                });

                // Trim .html in MiniTOC links
                getEntryHooks(run.entry).State.tap('SkipHtml', (state) => {
                    state.data.headings = mapHeadings(state.data.headings);
                });

                // Trim .html in Doc Page links
                getMarkdownHooks(run.markdown).Plugins.tap('SkipHtml', (plugins) => {
                    return plugins.concat(skipHtmlLinks);
                });

                // Trim .html in Leading Page links
                getLeadingHooks(run.leading).Dump.tapPromise('SkipHtml', async (vfile) => {
                    vfile.data = await run.leading.walkLinks(vfile.data, getHref);
                });
            });

        // Generate redirects without index.html
        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('SkipHtml', async (run) => {
                if (!run.config.skipHtmlExtension) {
                    return;
                }

                const langRelativePath: RelativePath = `./${run.config.lang}`;
                const pagePath = join(run.output, 'index.html');

                // Generate root lang redirect without index.html
                const content = await run.redirects.page('./', langRelativePath);
                await run.write(pagePath, content, true);
            });
    }
}
