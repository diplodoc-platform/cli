import type {Build} from '~/commands/build';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getBaseHooks} from '~/core/program';
import {normalizePath, own} from '~/core/utils';
import {Command, defined} from '~/core/config';
import {options} from './config';
import type {Toc, TocItem} from '~/core/toc';
import {getHref} from './utils';
import {join} from 'node:path';
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

                // Link handling in TOC
                getTocHooks(run.toc).Dump.tapPromise('SkipHtml', async (vfile) => {
                    await run.toc.walkItems([vfile.data as Toc], (item: Toc | TocItem) => {
                        if (own<string, 'href'>(item, 'href')) {
                            item.href = normalizePath(getHref(item.href));
                        }

                        return item;
                    });
                });

                // Connecting a plugin to bypass links
                getMarkdownHooks(run.markdown).Plugins.tap('SkipHtml', (plugins) => {
                    return plugins.concat(skipHtmlLinks);
                });

                getLeadingHooks(run.leading).Dump.tapPromise('SkipHtml', async (vfile) => {
                    vfile.data = await run.leading.walkLinks(vfile.data, (link: string) => {
                        return getHref(link);
                    });
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
