import type {Build} from '~/commands/build';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks, Toc, TocItem} from '~/core/toc';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {isExternalHref, normalizePath, own} from '~/core/utils';
import {getHooks as getBaseHooks} from '~/core/program';
import {Command} from '~/core/config';
import {options} from './config';
import {defined} from '~/core/config';
import {getBaseMdItPlugins, prettifyLink} from './utils';
import {join} from 'node:path';


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

        getBaseHooks(program).Config.tap('Search', (config) => {
            if (!config.skipHtmlExtension) return config;

            const search = {
                ...config.search,
                skipHtmlExtension: config.skipHtmlExtension,
            };

            config.search = search;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Html', async (run) => {
                const skipHtmlExtension = run.config.skipHtmlExtension;

                getTocHooks(run.toc).Dump.tapPromise('Html', async (vfile) => {
                    if (!skipHtmlExtension) return;

                    await run.toc.walkItems([vfile.data as Toc], (item: Toc | TocItem) => {
                        if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                            const newHref = prettifyLink(item.href);

                            item.href = normalizePath(newHref);
                        }

                        return item;
                    });
                });

                getMarkdownHooks(run.markdown).Plugins.tap('Html', (plugins) => {      
                    if (!skipHtmlExtension) return plugins;

                    return plugins.concat(getBaseMdItPlugins());
                });

                getLeadingHooks(run.leading).Dump.tapPromise('Html', async (vfile) => {
                    if (!skipHtmlExtension) return;
                    
                    vfile.data = await run.leading.walkLinks(
                        vfile.data,
                        getHref(),
                    );
                });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('Html', async (run) => {
                const skipHtmlExtension = run.config.skipHtmlExtension;

                // separatrix: тут неправильно каждый раз перезаписывать
                const newTo = !skipHtmlExtension ? 'index.html' : '';
                const langRelativePath: RelativePath = `./${run.config.lang}/${newTo}`;
                const pagePath = join(run.output, 'index.html');

                const content = await run.redirects.page('./', langRelativePath);
                await run.write(pagePath, content, true);
            });
    }
}

function getHref() {
    return function (href: string) {
        if (isExternalHref(href)) {
            return href;
        }

        return prettifyLink(href);
    };
}
