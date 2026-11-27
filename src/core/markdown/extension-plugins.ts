import type {MarkdownIt} from 'markdown-it';

import {colorPlugin} from '@diplodoc/color-extension';
import {noTranslate} from '@diplodoc/translation';
import * as mermaid from '@diplodoc/mermaid-extension';
import * as latex from '@diplodoc/latex-extension';
import * as openapi from '@diplodoc/openapi-extension';
import * as pageConstructor from '@diplodoc/page-constructor-extension/plugin/csr';

/** Configures the CLI extensions and their bundled asset locations. */
export function extensionPlugins() {
    return {
        color: (md: MarkdownIt) => colorPlugin(md, {inline: true}),
        noTranslate: noTranslate({mode: 'render'}),
        mermaid: mermaid.transform({
            bundle: false,
            runtime: '_bundle/mermaid-extension.js',
        }),
        latex: latex.transform({
            bundle: false,
            runtime: {
                script: '_bundle/latex-extension.js',
                style: '_bundle/latex-extension.css',
            },
        }),
        openapi: openapi.transform(),
        // SSR can produce nested links that a browser repairs before hydration.
        pageConstructor: pageConstructor.transform({
            bundle: false,
            runtime: {
                script: '_bundle/page-constructor-extension.js',
                style: '_bundle/page-constructor-extension.css',
            },
        }),
    };
}
