import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {MarkdownItPluginCb, MarkdownItPluginOpts} from '@diplodoc/transform/lib/typings';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';
import {optimize} from 'svgo';

import {isExternalHref, normalizePath} from '~/core/utils';

type Options = MarkdownItPluginOpts & {
    path: NormalizedPath;
    assets: Record<NormalizedPath, string | boolean>;
    inlineSvg?: boolean;
};

function prefix() {
    const value = Math.floor(Math.random() * 1e9);

    return value.toString(16);
}

function convertSvg(file: NormalizedPath, state: StateCore, {assets}: Options) {
    const result = optimize(assets[file] as string, {
        plugins: [
            {
                name: 'prefixIds',
                params: {
                    prefix: prefix(),
                },
            },
        ],
    });

    const content = result.data;
    const svgToken = new state.Token('image_svg', '', 0);
    svgToken.attrSet('content', content);

    return svgToken;
}

export default ((md, opts) => {
    const {path, assets, log} = opts;

    const plugin = (state: StateCore) => {
        const tokens = state.tokens;

        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].type !== 'inline') {
                continue;
            }

            const childrenTokens = tokens[i].children || [];

            for (let j = 0; j < childrenTokens.length; j++) {
                if (childrenTokens[j].type !== 'image') {
                    continue;
                }

                const didPatch = childrenTokens[j].attrGet('yfm_patched') || false;

                if (didPatch) {
                    continue;
                }

                const imgSrc = childrenTokens[j].attrGet('src') || '';
                const shouldInlineSvg = opts.inlineSvg !== false;

                if (isExternalHref(imgSrc)) {
                    continue;
                }

                const root = state.env.path || path;
                const file = normalizePath(join(dirname(root), imgSrc));

                if (!assets[file]) {
                    log.error(`Asset not found: ${bold(file)} in ${bold(root)}`);
                    continue;
                }

                if (imgSrc.endsWith('.svg') && shouldInlineSvg) {
                    childrenTokens[j] = convertSvg(file, state, opts);
                } else {
                    childrenTokens[j].attrSet('src', file);
                }

                childrenTokens[j].attrSet('yfm_patched', '1');
            }
        }
    };

    try {
        md.core.ruler.before('includes', 'images', plugin);
    } catch (e) {
        md.core.ruler.push('images', plugin);
    }

    md.renderer.rules.image_svg = (tokens, index) => {
        const token = tokens[index];

        return token.attrGet('content') || '';
    };
}) as MarkdownItPluginCb<Options>;
