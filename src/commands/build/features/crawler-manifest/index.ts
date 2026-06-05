import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {CrawlerConfig} from './types';

import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {isExternalHref, walkLinks} from '~/core/utils';
import {valuable} from '~/core/config';

import {options} from './config';
import {collectCrawlerExcludes, collectLinks, crawlerNotifications} from './utils';

export type CrawlerManifestArgs = {
    crawlerManifest: boolean;
};

export type CrawlerManifestConfig = {
    crawlerManifest: boolean;
};

const MANIFEST_FILENAME = 'crawler-manifest.json';

export class CrawlerManifest {
    private readonly links = new Map<string, string[]>();
    private excludeUrls = new Set<string>();
    private excludeRegexps: RegExp[] = [];

    apply(program: Build) {
        getBaseHooks(program).Command.tap('CrawlerManifest', (command: Command) => {
            command.addOption(options.crawlerManifest);
        });

        getBaseHooks(program).Config.tapPromise('CrawlerManifest', async (config, args) => {
            let crawlerManifest = false;

            if (valuable(config.crawlerManifest)) {
                crawlerManifest = Boolean(config.crawlerManifest);
            }

            if (valuable(args.crawlerManifest)) {
                crawlerManifest = Boolean(args.crawlerManifest);
            }

            config.crawlerManifest = crawlerManifest;

            const {urls, regexps} = collectCrawlerExcludes(config as CrawlerConfig);

            this.excludeUrls = new Set(urls);
            this.excludeRegexps = regexps;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('CrawlerManifest', (run: Run) => {
                this.links.clear();

                getTocHooks(run.toc).Loaded.tapPromise('CrawlerManifest', async (toc: Toc) => {
                    if (!run.config.crawlerManifest) {
                        return;
                    }

                    const externalLinks: string[] = [];

                    walkLinks(toc as unknown as object, (value) => {
                        if (isExternalHref(value)) {
                            externalLinks.push(value);
                        }
                    });

                    const filtered = this.filterLinks(externalLinks);

                    if (filtered.length > 0) {
                        this.links.set(toc.path, [
                            ...(this.links.get(toc.path) ?? []),
                            ...filtered,
                        ]);
                    }
                });
            });

        getBuildHooks(program)
            .Entry.for('md')
            .tapPromise('CrawlerManifest', async (run: Run, entry) => {
                if (!run.config.crawlerManifest) {
                    return;
                }

                if (!entry.endsWith('.md') && !entry.endsWith('.yaml') && !entry.endsWith('.yml')) {
                    return;
                }

                const externalLinks = await collectLinks(run, entry);
                const filtered = this.filterLinks([...new Set(externalLinks)]);

                if (filtered.length > 0) {
                    this.links.set(entry, filtered);
                }
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('CrawlerManifest', async (run: Run) => {
                if (!run.config.crawlerManifest) {
                    return;
                }

                for (const {from, to} of run.redirects.files) {
                    if (isExternalHref(to) && !this.isExcluded(to)) {
                        const key = from.startsWith('/') ? from.slice(1) : from;
                        const existing = this.links.get(key) ?? [];

                        this.links.set(key, [...existing, to]);
                    }
                }

                if (this.links.size === 0) {
                    return;
                }

                const links = Object.fromEntries(this.links);
                const notifications = crawlerNotifications(run.config as CrawlerConfig);
                const manifest: Record<string, unknown> = {links};

                if (notifications) {
                    manifest['notifications'] = notifications;
                }

                await run.write(
                    join(run.output, MANIFEST_FILENAME),
                    JSON.stringify(manifest),
                    true,
                );
            });
    }

    private isExcluded(url: string): boolean {
        if (this.excludeUrls.has(url)) {
            return true;
        }

        return this.excludeRegexps.some((re) => re.test(url));
    }

    private filterLinks(links: string[]): string[] {
        if (this.excludeUrls.size === 0 && this.excludeRegexps.length === 0) {
            return links;
        }

        return links.filter((url) => !this.isExcluded(url));
    }
}
