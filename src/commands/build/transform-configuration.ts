import type {TransformConfig} from './run';

import {defineLegacyPlugin, defineTransformOptions} from '@diplodoc/transform/configuration';

/**
 * Keep CLI hook order and plugin-specific data while moving parser installation
 * onto the strict configuration boundary. Lint and collect keep their own APIs.
 */
export function configureTransform<T extends TransformConfig & {enableMarkdownAttrs?: boolean}>(
    options: T,
) {
    const {plugins, ...legacyOptions} = options;

    return defineTransformOptions({
        core: {
            highlighter: options.highlighter,
            allowHTML: options.allowHTML,
            needToSanitizeHtml: options.needToSanitizeHtml,
            breaks: options.breaks,
            linkify: options.linkify,
            linkifyTlds: options.linkifyTlds,
            path: options.path,
            lang: options.lang,
            getPublicPath: options.getPublicPath,
            extractTitle: options.extractTitle,
            log: options.log,
            deprecationWarnings: options.deprecationWarnings,
            ...(options.svgMaxEntityCount === undefined
                ? {}
                : {svgMaxEntityCount: options.svgMaxEntityCount}),
            svgInline: options.svgInline,
            generateID: options.generateID,
            rawContent: options.rawContent,
            calcPath: options.calcPath,
            replaceImageSrc: options.replaceImageSrc,
            ...(typeof options.enableMarkdownAttrs === 'boolean'
                ? {enableMarkdownAttrs: options.enableMarkdownAttrs}
                : {}),
        },
        plugins: {
            preset: 'none',
            plugins: plugins.map((plugin, index) =>
                defineLegacyPlugin<typeof legacyOptions>({
                    // Local identities for anonymous hook callbacks, not public plugin IDs.
                    id: `cli/hook-${index}`,
                    plugin,
                })(legacyOptions),
            ),
        },
    });
}
