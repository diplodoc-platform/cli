import type StateCore from 'markdown-it/lib/rules_core/state_core';
import type {
    ImageOptions,
    MarkdownItPluginCb,
    MarkdownItPluginOpts,
} from '@diplodoc/transform/lib/typings';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';
import {optimize} from 'svgo';
import {replaceSvgContent} from '@diplodoc/transform/lib/plugins/images';

import {filterTokens, isExternalHref, normalizePath} from '~/core/utils';

type Options = MarkdownItPluginOpts & {
    path: NormalizedPath;
    assets: Record<NormalizedPath, string | boolean>;
    inlineSvg?: boolean;
};

function convertSvg(
    file: NormalizedPath,
    state: StateCore,
    {assets}: Options,
    imageOpts: ImageOptions,
) {
    const result = optimize(assets[file] as string);
    const content = result.data === '' ? '' : replaceSvgContent(result.data, imageOpts);
    const svgToken = new state.Token('image_svg', '', 0);
    svgToken.attrSet('content', content);

    return svgToken;
}

export default ((md, opts) => {
    const {path, assets, log} = opts;

    const plugin = (state: StateCore) => {
        const tokens = state.tokens;

        filterTokens(tokens, 'inline', (inline, {commented}) => {
            if (commented || !inline.children) {
                return;
            }

            const childrenTokens = inline.children || [];

            filterTokens(childrenTokens, 'image', (image, {commented, index}) => {
                const didPatch = image.attrGet('yfm_patched') || false;

                if (didPatch || commented) {
                    return;
                }

                const imgSrc = image.attrGet('src') || '';
                const shouldInlineSvg =
                    image.attrGet('inline') === null
                        ? opts.inlineSvg !== false
                        : image.attrGet('inline') === 'true';
                const imageOpts = {
                    width: image.attrGet('width'),
                    height: image.attrGet('height'),
                    inline: shouldInlineSvg,
                };

                if (isExternalHref(imgSrc)) {
                    return;
                }

                const root = state.env.path || path;
                const file = normalizePath(join(dirname(root), imgSrc));

                if (!assets[file]) {
                    log.error(`Asset not found: ${bold(file)} in ${bold(root)}`);
                    return;
                }

                if (imgSrc.endsWith('.svg') && shouldInlineSvg) {
                    childrenTokens[index] = convertSvg(file, state, opts, imageOpts);
                } else {
                    image.attrSet('src', file);
                    image.attrSet('yfm_patched', '1');
                }
            });
        });
    };

    try {
        md.core.ruler.before('includes', 'images', plugin);
    } catch {
        md.core.ruler.push('images', plugin);
    }

    md.renderer.rules.image_svg = (tokens, index) => {
        const token = tokens[index];

        return token.attrGet('content') || '';
    };
}) as MarkdownItPluginCb<Options>;
