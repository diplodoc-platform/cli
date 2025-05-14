import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb, MarkdownItPluginOpts} from '@diplodoc/transform/lib/typings';

import {bold} from 'chalk';

import {filterTokens} from '~/core/utils';

const INCLUDE_REGEXP = /^{%\s*include\s*(notitle)?\s*\[(.+?)]\((.+?)\)\s*%}$/;

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
        unfoldIncludes(state, options);
        env.includes.pop();
    };

    try {
        md.core.ruler.before('includes', 'includes_detect', plugin);
    } catch (e) {
        md.core.ruler.push('includes_detect', plugin);
    }
}) as MarkdownItPluginCb<Options>;

function unfoldIncludes(state: StateCore, options: Options) {
    const {log} = options;
    const {tokens} = state;

    // @ts-ignore
    filterTokens(tokens, 'paragraph_open', (_openToken, {index}) => {
        const contentToken = tokens[index + 1];
        const closeToken = tokens[index + 2];

        if (contentToken.type !== 'inline' || closeToken.type !== 'paragraph_close') {
            return;
        }

        const match = contentToken.content.match(INCLUDE_REGEXP);
        if (!match) {
            return;
        }

        try {
            const [, keyword /* description */, , path] = match;
            const includeToken = new state.Token('include', '', 0);

            includeToken.attrSet('path', path);
            includeToken.attrSet('keyword', keyword);

            tokens.splice(index, 3, includeToken);
        } catch (e) {
            // @ts-ignore for some reason typescript fails here
            const errPath = e.path;

            log.error(`Include skipped. Skip reason: ${e} in ${errPath}`);
        }
    });
}
