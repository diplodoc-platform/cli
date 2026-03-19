import type Token from 'markdown-it/lib/token';
import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';
import type {Toc} from '~/core/toc';

import {dirname, join} from 'node:path';
import {load as yamlLoad} from 'js-yaml';
import MarkdownIt from 'markdown-it';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {isExternalHref, normalizePath, walkLinks} from '~/core/utils';
import {INCLUDE_REGEX, findLink} from '~/core/markdown';
import {valuable} from '~/core/config';

import {options} from './config';

export type CrawlerManifestArgs = {
    crawlerManifest: boolean;
};

export type CrawlerManifestConfig = {
    crawlerManifest: boolean;
};

const MANIFEST_FILENAME = 'crawler-manifest.json';

const FILE_BLOCK_REGEX = /{%\s*file\s[^%]*?src="([^"]{1,2048})"/g;

const md = new MarkdownIt({html: true, linkify: true});

function walkTokens(tokens: Token[], links: Set<string>): void {
    for (const token of tokens) {
        if (token.type === 'link_open') {
            const href = token.attrGet('href');

            if (href && isExternalHref(href)) {
                links.add(href);
            }
        } else if (token.type === 'image') {
            const src = token.attrGet('src');

            if (src && isExternalHref(src)) {
                links.add(src);
            }
        }

        if (token.children) {
            walkTokens(token.children, links);
        }
    }
}

export function extractExternalLinks(content: string): string[] {
    const links = new Set<string>();
    const env: {references?: Record<string, {href: string}>} = {};

    walkTokens(md.parse(content, env), links);

    for (const ref of Object.values(env.references ?? {})) {
        if (ref.href && isExternalHref(ref.href)) {
            links.add(ref.href);
        }
    }

    for (const match of content.matchAll(FILE_BLOCK_REGEX)) {
        if (isExternalHref(match[1])) {
            links.add(match[1]);
        }
    }

    return [...links];
}

function stripFencedBlocks(content: string): string {
    const lines = content.split('\n');
    const out: string[] = [];
    let fenceChar = '';
    let fenceLen = 0;

    for (const line of lines) {
        const normalized = line.replace(/\r$/, '');

        if (fenceLen === 0) {
            const fence = /^(`{3,}|~{3,})/.exec(normalized);

            if (fence) {
                fenceChar = fence[1][0];
                fenceLen = fence[1].length;
            } else {
                out.push(line);
            }
        } else {
            const re = fenceChar === '`' ? /^(`{3,})[ \t]*$/ : /^(~{3,})[ \t]*$/;
            const fence = re.exec(normalized);

            if (fence && fence[1].length >= fenceLen) {
                fenceChar = '';
                fenceLen = 0;
            }
        }
    }

    return out.join('\n');
}

function stripNonContent(content: string): string {
    return stripFencedBlocks(content.replace(/<!--[\s\S]*?-->/g, '')).replace(/`[^`\n]+`/g, '');
}

export function collectExternalLinksFromYaml(content: string): string[] {
    const links: string[] = [];

    try {
        const data = yamlLoad(content);

        if (data && typeof data === 'object') {
            walkLinks(data, (value) => {
                if (isExternalHref(value)) {
                    links.push(value);
                }
            });
        }
    } catch {}

    return links;
}

export function extractIncludePaths(content: string): string[] {
    const stripped = stripNonContent(content);
    const paths: string[] = [];

    for (const match of stripped.matchAll(INCLUDE_REGEX)) {
        const link = findLink(match[0]);

        if (link && !isExternalHref(link)) {
            paths.push(link);
        }
    }

    return paths;
}

export async function collectLinks(
    run: Run,
    filePath: string,
    visited = new Set<string>(),
): Promise<string[]> {
    const normalized = normalizePath(filePath);

    if (visited.has(normalized)) {
        return [];
    }

    visited.add(normalized);

    let content: string;

    try {
        content = await run.read(join(run.input, normalized) as AbsolutePath);
    } catch {
        return [];
    }

    const links = extractExternalLinks(content);
    const isYaml = normalized.endsWith('.yaml') || normalized.endsWith('.yml');

    if (isYaml) {
        links.push(...collectExternalLinksFromYaml(content));
    }

    if (normalized.endsWith('.md')) {
        for (const includePath of extractIncludePaths(content)) {
            const resolved = normalizePath(join(dirname(normalized), includePath));
            const includeLinks = await collectLinks(run, resolved, visited);

            links.push(...includeLinks);
        }
    }

    return links;
}

export class CrawlerManifest {
    private readonly links = new Map<string, string[]>();

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

                    if (externalLinks.length > 0) {
                        this.links.set(toc.path, [
                            ...(this.links.get(toc.path) ?? []),
                            ...externalLinks,
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

                if (externalLinks.length > 0) {
                    this.links.set(entry, [...new Set(externalLinks)]);
                }
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('CrawlerManifest', async (run: Run) => {
                if (!run.config.crawlerManifest) {
                    return;
                }

                for (const {from, to} of run.redirects.files) {
                    if (isExternalHref(to)) {
                        const key = from.startsWith('/') ? from.slice(1) : from;
                        const existing = this.links.get(key) ?? [];

                        this.links.set(key, [...existing, to]);
                    }
                }

                if (this.links.size === 0) {
                    return;
                }

                const manifest = Object.fromEntries(this.links);

                await run.write(
                    join(run.output, MANIFEST_FILENAME),
                    JSON.stringify(manifest),
                    true,
                );
            });
    }
}
