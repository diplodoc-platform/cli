import type {StateCore, Token} from '~/core/markdown/parser';
import type {MarkdownItPluginCb, MarkdownItPluginOpts} from '@diplodoc/transform/types';
import type {ParsedDocumentFragment} from '@diplodoc/transform/document';
import type {TokenSourceInfo} from '@diplodoc/yfmlint';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';
import {extractFrontMatter} from '@diplodoc/liquid';
import {
    materializeFootnoteTokens,
    parseDocumentFragmentResult,
    replayDocumentFragment,
} from '@diplodoc/transform/document';

import {filterTokens, normalizePath} from '~/core/utils';

export interface IncludeChainEntry {
    file: string;
    line: number;
}

/**
 * Strips YAML frontmatter from include file content if present.
 * Include files written by md2md may have frontmatter (e.g. csp, metadata);
 * when used as include body they must not be rendered as content.
 */
export function contentWithoutFrontmatter(raw: string): string {
    const [, content] = extractFrontMatter(raw, {json: true});
    return content;
}

/** Attach host attribution to owned token copies without mutating authored metadata. */
function tagTokensWithSource(
    tokens: Token[],
    sourceFile: string,
    includeChain: IncludeChainEntry[],
    cachedChain: IncludeChainEntry[],
) {
    for (const token of tokens) {
        const sourced: Token & {sourceInfo?: TokenSourceInfo} = token;
        const previous = sourced.sourceInfo;
        const prefixMatches =
            previous &&
            cachedChain.every(
                (entry, index) =>
                    previous.includeChain[index]?.file === entry.file &&
                    previous.includeChain[index]?.line === entry.line,
            );
        sourced.sourceInfo =
            previous && prefixMatches
                ? {
                      sourceFile: previous.sourceFile,
                      includeChain: [
                          ...includeChain,
                          ...previous.includeChain.slice(cachedChain.length),
                      ],
                  }
                : previous || {sourceFile, includeChain: [...includeChain]};
        if (token.children)
            tagTokensWithSource(token.children, sourceFile, includeChain, cachedChain);
    }
}

function stripTitleTokens(tokens: Token[]) {
    const [open, _, close] = tokens;

    if (open?.type === 'heading_open' && close?.type === 'heading_close') {
        return tokens.slice(3);
    }

    return tokens;
}

type Options = MarkdownItPluginOpts & {
    path: NormalizedPath;
    files: Record<NormalizedPath, string>;
};

/**
 * Merges resource arrays (script, style) collected during nested
 * include parsing back into the parent env.  This is necessary because
 * `{...env}` spread breaks the `meta` getter/setter proxy — extensions
 * that run inside nested `md.parse` create a new `meta` object on the
 * copy, and their additions are lost without explicit propagation.
 */
export function mergeNestedMeta(
    parentEnv: Record<string, unknown>,
    nestedMeta: Record<string, unknown> | undefined,
) {
    if (!nestedMeta) {
        return;
    }

    const parent = (parentEnv.meta || {}) as Record<string, unknown>;
    parentEnv.meta = parent;

    for (const key of ['script', 'style']) {
        const items = nestedMeta[key];
        if (!Array.isArray(items) || items.length === 0) {
            continue;
        }
        const target: string[] = (parent[key] as string[]) || [];
        parent[key] = target;
        for (const item of items) {
            if (!target.includes(item)) {
                target.push(item);
            }
        }
    }
}

type CacheEntry = {fragment: ParsedDocumentFragment; includeChain: IncludeChainEntry[]};

export default ((md, options) => {
    const {path: optPath, log} = options;

    const cache: Hash<CacheEntry> = {};

    const plugin = (state: StateCore) => {
        const {env} = state;
        const path = normalizePath(env.path || optPath);

        env.includes = env.includes || [];

        const isCircularInclude = env.includes.includes(path);

        if (isCircularInclude) {
            log.error(`Circular includes: ${bold(env.includes.concat(path).join(' ▶ '))}`);
            return;
        }

        env.includes.push(path);
        try {
            unfoldIncludes(path, state, options, cache);
        } finally {
            env.includes.pop();
        }
    };

    try {
        md.core.ruler.before('curly_attributes', 'includes', plugin);
    } catch {
        md.core.ruler.push('includes', plugin);
    }
}) as MarkdownItPluginCb<Options>;

function unfoldIncludes(
    path: NormalizedPath,
    state: StateCore,
    options: Options,
    cache: Hash<CacheEntry>,
) {
    const {log, files} = options;
    const {tokens, md, env} = state;

    // @ts-ignore
    filterTokens(tokens, 'include', (token, {index}) => {
        try {
            const includeLine = token.map ? token.map[0] + 1 : undefined;
            const includePath = token.attrGet('path') as string;
            const keyword = token.attrGet('keyword');

            if (includePath.startsWith('#')) {
                log.warn(
                    [
                        `YFM014 ${path}: Anchor "${includePath}" cannot be used as file path`,
                        ``,
                        `Expected syntax:`,
                        `  {% include [text](path/to/file.md) %}`,
                        ``,
                        `Include will be skipped.`,
                    ].join('\n'),
                );

                tokens.splice(index, 1);

                return {skip: 0};
            }

            const [pathname, hash] = includePath.split('#');
            const includeFullPath = normalizePath(join(dirname(path), pathname));
            const includeContent = files[includeFullPath];

            if (typeof includeContent !== 'string') {
                const includeLocation = includeLine ? `${path}:${includeLine}` : path;
                log.error(
                    `Include skipped in (${bold(includeLocation)}). Include source for ${bold(includeFullPath)} not found`,
                );

                return;
            }

            const bodyContent = contentWithoutFrontmatter(includeContent);

            const parentChain: IncludeChainEntry[] = Array.isArray(env.includeChain)
                ? env.includeChain.filter(
                      (entry): entry is IncludeChainEntry =>
                          typeof entry === 'object' &&
                          entry !== null &&
                          typeof entry.file === 'string' &&
                          typeof entry.line === 'number',
                  )
                : [];
            const currentChain: IncludeChainEntry[] = includeLine
                ? [...parentChain, {file: path, line: includeLine}]
                : [...parentChain];

            let cached = cache[includeFullPath];
            if (!cached) {
                const originalChain = Object.getOwnPropertyDescriptor(env, 'includeChain');
                if (originalChain && !originalChain.configurable) {
                    throw new TypeError('Cannot temporarily set non-configurable includeChain');
                }
                try {
                    Object.defineProperty(env, 'includeChain', {
                        value: [...currentChain],
                        writable: true,
                        configurable: true,
                        enumerable: true,
                    });
                    const fragment = parseDocumentFragmentResult(md, bodyContent, env, {
                        purpose: 'reference',
                        path: includeFullPath,
                    });
                    cached = {fragment, includeChain: [...currentChain]};
                    cache[includeFullPath] = cached;
                } finally {
                    if (originalChain) Object.defineProperty(env, 'includeChain', originalChain);
                    else Reflect.deleteProperty(env, 'includeChain');
                }
            }
            const fileTokens = cached.fragment.tokens;

            let includedTokens: Token[];
            if (hash) {
                includedTokens = cutTokens(fileTokens, hash);

                if (includedTokens.length === 0) {
                    log.warn(
                        [
                            `YFM015 ${path}: Anchor "#${hash}" not found in ${includeFullPath}`,
                            ``,
                            `Include will be skipped.`,
                        ].join('\n'),
                    );
                }
            } else {
                includedTokens = fileTokens;
            }

            if (keyword === 'notitle') {
                includedTokens = stripTitleTokens(includedTokens);
            }
            if (!includedTokens.length) {
                tokens.splice(index, 1);
                return {skip: 0};
            }

            // The materializer needs original selected identities and the actual
            // placeholder; ordinary selections are still copied before tagging.
            const materialized = materializeFootnoteTokens(fileTokens, includedTokens, token);
            includedTokens =
                materialized === includedTokens
                    ? includedTokens.map((item) => copyToken(state, item))
                    : materialized;
            tagTokensWithSource(includedTokens, includeFullPath, currentChain, cached.includeChain);
            replayDocumentFragment(md, cached.fragment, env, {purpose: 'include'});

            tokens.splice(index, 1, ...includedTokens);

            return {skip: includedTokens.length};
        } catch (e) {
            // @ts-ignore for some reason typescript fails here
            const errPath = e.path;

            log.error(`Include skipped. Skip reason: ${e} in ${errPath}`);
        }
    });
}

function copyToken(state: StateCore, token: Token): Token {
    const result = new state.Token(token.type, token.tag, token.nesting);
    const descriptors = Object.getOwnPropertyDescriptors(token);
    if (descriptors.attrs?.value)
        descriptors.attrs.value = token.attrs?.map(([key, value]) => [key, value]);
    if (descriptors.map?.value && token.map) descriptors.map.value = [token.map[0], token.map[1]];
    if (descriptors.children?.value)
        descriptors.children.value = token.children?.map((child) => copyToken(state, child));
    Object.setPrototypeOf(result, Object.getPrototypeOf(token));
    Object.defineProperties(result, descriptors);
    return result;
}

function cutTokens(tokens: Token[], id: string) {
    const start = tokens.findIndex((token) => {
        return (
            (token.type === 'paragraph_open' || token.type === 'heading_open') &&
            token.attrGet('id') === id
        );
    });

    if (start === -1) {
        return [];
    }

    const startToken = tokens[start];

    switch (startToken.type) {
        case 'paragraph_open':
            return cutParagraph(tokens, start);
        case 'heading_open':
            return cutHeading(tokens, start);
        default:
            return [];
    }
}

function cutParagraph(tokens: Token[], start: number) {
    const end = tokens.findIndex((token, index) => {
        return token.type === 'paragraph_close' && index > start;
    });

    if (end === -1) {
        return [];
    }

    return tokens.slice(start, end + 1);
}

function cutHeading(tokens: Token[], start: number) {
    const level = Number(tokens[start].tag.slice(1));

    for (let index = start + 1; index < tokens.length; index++) {
        const token = tokens[index];

        // Section ends only at the next heading of the SAME level — this
        // matches `findBlockTokens` in @diplodoc/transform (the viewer's
        // source of truth) and `processHeadingForSection` in merge-includes.
        // Using `>=` here was a divergence: a nested include expanded inside
        // the section can introduce a shallower heading (e.g. an `### {#x}`
        // from an included file inside an `#### {#section}` block).  With
        // `>=` that shallower heading wrongly terminated the section, so a
        // `notitle` include collapsed to nothing.  Surfaced on alice
        // uz/smart-home/.../unruly.md (#quick-notifications → telegram).
        if (token.type === 'heading_open' && level === Number(token.tag.slice(1))) {
            return tokens.slice(start, index);
        }
    }

    return tokens.slice(start);
}
