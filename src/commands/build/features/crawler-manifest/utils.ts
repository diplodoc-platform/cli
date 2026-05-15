import type Token from 'markdown-it/lib/token';
import type {Run} from '~/commands/build';
import type {CrawlerExcludeConfig} from './types';

import {dirname, join} from 'node:path';
import {load as yamlLoad} from 'js-yaml';
import MarkdownIt from 'markdown-it';

import {INCLUDE_REGEX, findLink} from '~/core/markdown';
import {isExternalHref, normalizePath, walkLinks} from '~/core/utils';

import {FILE_BLOCK_REGEX, REGEXP_LITERAL} from './constants';

const md = new MarkdownIt({html: true, linkify: true});
const mdNoLinkify = new MarkdownIt({html: true, linkify: false});

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

export function extractExternalLinks(content: string, {linkify = true} = {}): string[] {
    const links = new Set<string>();
    const env: {references?: Record<string, {href: string}>} = {};

    walkTokens((linkify ? md : mdNoLinkify).parse(content, env), links);

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

    const isYaml = normalized.endsWith('.yaml') || normalized.endsWith('.yml');
    const links = isYaml
        ? [
              ...extractExternalLinks(content, {linkify: false}),
              ...collectExternalLinksFromYaml(content),
          ]
        : extractExternalLinks(content);

    if (normalized.endsWith('.md')) {
        for (const includePath of extractIncludePaths(content)) {
            const resolved = normalizePath(join(dirname(normalized), includePath));
            const includeLinks = await collectLinks(run, resolved, visited);

            links.push(...includeLinks);
        }
    }

    return links;
}

export function parseRegexps(patterns: unknown[]): RegExp[] {
    const result: RegExp[] = [];

    for (const pattern of patterns) {
        if (typeof pattern !== 'string') continue;

        const match = REGEXP_LITERAL.exec(pattern);

        try {
            result.push(match ? new RegExp(match[1], match[2]) : new RegExp(pattern));
        } catch {}
    }

    return result;
}

export function collectCrawlerExcludes(config: CrawlerExcludeConfig): {
    urls: string[];
    regexps: RegExp[];
} {
    const excludes = [config.crawler?.exclude, config['docs-viewer']?.crawler?.exclude];

    const urls = excludes.flatMap((exclude) =>
        Array.isArray(exclude?.url)
            ? exclude.url.filter((v): v is string => typeof v === 'string')
            : [],
    );

    const regexpPatterns = excludes.flatMap((exclude) =>
        Array.isArray(exclude?.regexp) ? exclude.regexp : [],
    );

    return {
        urls,
        regexps: parseRegexps(regexpPatterns),
    };
}
