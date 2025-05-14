import type Token from 'markdown-it/lib/token';
import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb, MarkdownItPluginOpts} from '@diplodoc/transform/lib/typings';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';

import {filterTokens, normalizePath} from '~/core/utils';

function stripTitleTokens(tokens: Token[]) {
    const [open, _, close] = tokens;

    if (open?.type === 'heading_open' && close?.type === 'heading_close') {
        tokens.splice(0, 3);
    }
}

type Options = MarkdownItPluginOpts & {
    path: NormalizedPath;
    files: Record<NormalizedPath, string>;
};

export default ((md, options) => {
    const {path: optPath, log} = options;

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
        unfoldIncludes(path, state, options);
        env.includes.pop();
    };

    try {
        md.core.ruler.before('curly_attributes', 'includes', plugin);
    } catch (e) {
        md.core.ruler.push('includes', plugin);
    }
}) as MarkdownItPluginCb<Options>;

function unfoldIncludes(path: NormalizedPath, state: StateCore, options: Options) {
    const {log, files} = options;
    const {tokens, md, env} = state;

    // @ts-ignore
    filterTokens(tokens, 'include', (token, {index}) => {
        try {
            const includePath = token.attrGet('path') as string;
            const keyword = token.attrGet('keyword');
            const [pathname, hash] = includePath.split('#');
            const includeFullPath = normalizePath(join(dirname(path), pathname));
            const includeContent = files[includeFullPath];

            if (typeof includeContent !== 'string') {
                log.error(`Include skipped. Include source for ${bold(includeFullPath)} not found`);
                return;
            }

            const fileTokens = md.parse(includeContent, {
                ...env,
                path: includeFullPath,
            });

            let includedTokens;
            if (hash) {
                // TODO: add warning about missed block
                includedTokens = findBlockTokens(fileTokens, hash);
            } else {
                includedTokens = fileTokens;
            }

            if (keyword === 'notitle') {
                stripTitleTokens(includedTokens);
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

function findBlockTokens(tokens: Token[], id: string) {
    let blockTokens: Token[] = [];
    let i = 0,
        startToken,
        start,
        end;
    while (i < tokens.length) {
        const token = tokens[i];

        if (typeof start === 'number' && startToken) {
            if (startToken.type === 'paragraph_open' && token.type === 'paragraph_close') {
                end = i + 1;
                break;
            } else if (startToken.type === 'heading_open') {
                if (token.type === 'heading_open' && token.tag === startToken.tag) {
                    end = i;
                    break;
                } else if (i === tokens.length - 1) {
                    end = tokens.length;
                }
            }
        }

        if (
            (token.type === 'paragraph_open' || token.type === 'heading_open') &&
            token.attrGet('id') === id &&
            typeof start === 'undefined'
        ) {
            startToken = token;
            start = i;
        }

        i++;
    }

    if (typeof start === 'number' && typeof end === 'number') {
        blockTokens = tokens.slice(start, end);
    }

    return blockTokens;
}
