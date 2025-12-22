import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb, MarkdownItPluginOpts} from '@diplodoc/transform/lib/typings';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';

import {filterTokens, normalizePath} from '~/core/utils';

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

export default ((md, options) => {
    const {path: optPath, log} = options;

    const cache: Hash<Token[]> = {};

    const plugin = (state: StateCore) => {
        const {env} = state;
        const path = env.path || optPath;

        env.includes = env.includes || [];

        const isCircularInclude = env.includes.includes(path);

        if (isCircularInclude) {
            log.error(`Circular includes: ${bold(env.includes.concat(path).join(' ▶ '))}`);
            return;
        }

        env.includes.push(path);
        unfoldIncludes(path, state, options, cache);
        env.includes.pop();
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
    cache: Hash<Token[]>,
) {
    const {log, files} = options;
    const {tokens, md, env} = state;

    // @ts-ignore
    filterTokens(tokens, 'include', (token, {index}) => {
        try {
            const includeLine = token.map ? token.map[0] + 1 : undefined;
            const includePath = token.attrGet('path') as string;
            const keyword = token.attrGet('keyword');
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

            const fileTokens =
                cache[includeFullPath] ||
                md.parse(includeContent, {
                    ...env,
                    path: includeFullPath,
                });

            let includedTokens: Token[];
            if (hash) {
                // TODO: add warning about missed block
                includedTokens = cutTokens(fileTokens, hash);
            } else {
                includedTokens = fileTokens;
            }

            if (keyword === 'notitle') {
                includedTokens = stripTitleTokens(includedTokens);
            }

            // If this is first usage - pick original tokens
            // otherwise copy tokens, do not use original, because there can be other meta.
            if (cache[includeFullPath]) {
                includedTokens = includedTokens.map((token) => copyToken(state, token));
            } else {
                cache[includeFullPath] = fileTokens;
            }

            tokens.splice(index, 1, ...includedTokens);

            return {skip: includedTokens.length};
        } catch (e) {
            // @ts-ignore for some reason typescript fails here
            const errPath = e.path;

            log.error(`Include skipped. Skip reason: ${e} in ${errPath}`);
        }
    });
}

function copyToken(state: StateCore, token: Token) {
    const result = new state.Token(token.type, token.tag, token.nesting);

    Object.assign(result, token);

    result.attrs = token.attrs?.map(([key, value]) => [key, value]) || null;
    result.map = (token.map?.slice() as [number, number]) || null;
    result.children = token.children?.map((token) => copyToken(state, token)) || null;

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

        if (token.type === 'heading_open' && level >= Number(token.tag.slice(1))) {
            return tokens.slice(start, index);
        }
    }

    return tokens.slice(start);
}
