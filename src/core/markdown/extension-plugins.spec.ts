import type {MarkdownItPluginOpts} from '@diplodoc/transform/types';

import {describe, expect, it} from 'vitest';
import {getLogger} from '@diplodoc/transform/log';

import {MarkdownItConstructor} from './parser';
import {extensionPlugins} from './extension-plugins';

const options: MarkdownItPluginOpts & {output: string} = {
    output: '.',
    path: 'index.md',
    root: '.',
    rootPublicPath: '',
    lang: 'en',
    isLintRun: false,
    log: getLogger(),
};
const mermaidOptions = {bundle: false, runtime: '_bundle/mermaid-extension.js'};
const latexOptions = {
    bundle: false,
    runtime: {
        script: '_bundle/latex-extension.js',
        style: '_bundle/latex-extension.css',
    },
};
const pageOptions = {
    bundle: false,
    runtime: {
        script: '_bundle/page-constructor-extension.js',
        style: '_bundle/page-constructor-extension.css',
    },
};

// Exercise the configured extension plugins with the CLI's runtime asset options.
const cases = [
    {
        name: 'color' as const,
        source: '{green}(a **bold** {blue}(b))',
        html: 'style="color: blue;"',
        meta: undefined,
    },
    {
        name: 'noTranslate' as const,
        source: ':no-translate[**inline**]\n\n:::no-translate\n**block**\n:::\n\n::no-translate[leaf]',
        html: '<p><strong>inline</strong></p>\n<p><strong>block</strong></p>\n<p>leaf</p>',
        meta: undefined,
    },
    {
        name: 'mermaid' as const,
        source: '```mermaid\ngraph LR; A-->B\n```',
        html: 'class="mermaid"',
        meta: {script: [mermaidOptions.runtime]},
    },
    {
        name: 'latex' as const,
        source: '$x^2$\n\n$$\ny^2\n$$',
        html: '<span class="yfm-latex"',
        meta: {
            script: [latexOptions.runtime.script, latexOptions.runtime.script],
            style: [latexOptions.runtime.style, latexOptions.runtime.style],
        },
    },
    {
        name: 'openapi' as const,
        source: '```openapi-sandbox\nmethod: get\npath: /test\nserver: http://localhost:8080\n```',
        html: 'class="yfm-openapi-sandbox-js"',
        meta: undefined,
    },
    {
        name: 'pageConstructor' as const,
        source: '::: page-constructor\nblocks:\n  - type: header-block\n    title: Local fixture\n    description: "**Nested markdown**"\n:::',
        html: 'data-rendered="false"',
        meta: {script: [pageOptions.runtime.script], style: [pageOptions.runtime.style]},
    },
];

describe('CLI extensions on the Markdown-it 15 host', () => {
    it.each(cases)('$name renders HTML and supplies runtime/style metadata', (item) => {
        const native = new MarkdownItConstructor({html: true});
        native.use(extensionPlugins()[item.name], options);
        const env: Record<string, unknown> = {};
        const html = native.render(item.source, env);

        expect(html).toContain(item.html);
        expect(env.meta).toEqual(item.meta);
        if (item.name === 'pageConstructor') {
            expect(decodeURIComponent(html)).toContain('<strong>Nested markdown</strong>');
        }
    });

    it.each(['mermaid', 'latex', 'pageConstructor'] as const)(
        '%s retains the Markdown collector',
        (name) => {
            const plugin = extensionPlugins()[name];
            expect('collect' in plugin).toBe(true);
            if (!('collect' in plugin) || typeof plugin.collect !== 'function') {
                throw new TypeError('Missing extension collector');
            }
            const item = cases.find((entry) => entry.name === name)!;
            // bundle:false collectors parse locally and return void; they must not copy assets.
            expect(plugin.collect(item.source, {destRoot: '.'})).toBeUndefined();
        },
    );
});

it('markdown-it-attrs preserves attributes on the native parser', () => {
    const attrs: unknown = require('markdown-it-attrs');
    if (typeof attrs !== 'function') {
        throw new TypeError('Expected callable markdown-it-attrs');
    }
    const native = new MarkdownItConstructor();
    const attrOptions = {leftDelimiter: '{', rightDelimiter: '}'};
    attrs(native, attrOptions);
    const source = '## Header {.fixture #anchor}\n\nParagraph {.body}';
    const html = native.render(source);
    expect(html).toContain('class="fixture" id="anchor"');
    expect(html).toContain('class="body"');
});
