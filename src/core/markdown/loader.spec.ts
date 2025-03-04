import type {Plugin} from './types';
import type {LoaderContext, TransformMode} from './loader';

import {describe, expect, it, vi} from 'vitest';
import {dedent} from 'ts-dedent';
import {SourceMap} from '@diplodoc/liquid';

import {Logger} from '~/core/logger';

import {loader} from './loader';

vi.mock('~/core/logger');

function loaderContext(
    raw: string,
    {
        mode = 'html',
        vars = {},
        options = {},
        settings = {},
        plugins = [],
    }: DeepPartial<LoaderContext> = {},
) {
    return {
        root: __dirname,
        path: 'file.md' as NormalizedPath,
        mode: mode as TransformMode,
        lang: 'ru',
        vars,
        logger: new Logger(),
        emitFile: vi.fn(),
        readFile: vi.fn(),
        markdown: {
            setComments: vi.fn(),
            setDependencies: vi.fn(),
            setAssets: vi.fn(),
            setMeta: vi.fn(),
            setHeadings: vi.fn(),
            setInfo: vi.fn(),
        },
        plugins: plugins as Plugin[],
        sourcemap: new SourceMap(raw),
        settings,
        options: {
            rootInput: __dirname,
            allowHTML: true,
            needToSanitizeHtml: true,
            supportGithubAnchors: true,

            disableLiquid: false,

            lintDisabled: false,
            lintConfig: {},
            ...options,
        },
    } as LoaderContext;
}

describe('Markdown loader', () => {
    it('should process simple text', async () => {
        const content = dedent`
            Simple text
        `;
        const context = loaderContext(content, {mode: 'md'});

        const result = await loader.call(context, content);

        expect(result).toEqual(content);
    });

    describe('mangleFrontMatter', () => {
        it('should extract frontmatter', async () => {
            const content = dedent`
                ---
                prop: value
                ---
                Simple text
            `;
            const context = loaderContext(content, {mode: 'md'});

            const result = await loader.call(context, content);

            expect(context.markdown.setMeta).toBeCalledWith('file.md', {prop: 'value'});
            expect(result).toEqual('Simple text');
        });

        it('should template frontmatter', async () => {
            const content = dedent`
                ---
                prop: {{text}}
                ---
                Simple text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {text: 'text'},
            });

            const result = await loader.call(context, content);

            expect(context.markdown.setMeta).toBeCalledWith('file.md', {prop: 'text'});
            expect(result).toEqual('Simple text');
        });

        it('should not template frontmatter if disabled', async () => {
            const content = dedent`
                ---
                prop: {{text}}
                ---
                Simple text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {text: 'text'},
                options: {disableLiquid: true},
            });

            const result = await loader.call(context, content);

            expect(context.markdown.setMeta).toBeCalledWith('file.md', {prop: '{{text}}'});
            expect(result).toEqual('Simple text');
        });
    });

    describe('findComments', () => {
        it('should find comment', async () => {
            const content = dedent`
                Simple text

                <!-- commented content -->

                end of text
            `;
            const context = loaderContext(content, {mode: 'md', vars: {text: 'text'}});

            await loader.call(context, content);

            expect(context.markdown.setComments).toHaveBeenCalledWith('file.md', [[13, 39]]);
        });
    });

    describe('templateContent', () => {
        it('should template substitutions', async () => {
            const content = dedent`
                Simple {{text}}
            `;
            const context = loaderContext(content, {mode: 'md', vars: {text: 'text'}});

            const result = await loader.call(context, content);

            expect(result).toEqual('Simple text');
        });

        it('should not template substitutions if disabled 1', async () => {
            const content = dedent`
                Simple {{text}}
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {text: 'text'},
                options: {disableLiquid: true},
            });

            const result = await loader.call(context, content);

            expect(result).toEqual('Simple {{text}}');
        });

        it('should not template substitutions if disabled 2', async () => {
            const content = dedent`
                Simple {{text}}
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {text: 'text'},
                settings: {substitutions: false},
            });

            const result = await loader.call(context, content);

            expect(result).toEqual('Simple {{text}}');
        });

        it('should template conditions', async () => {
            const content = dedent`
                {% if locale == "ru" %}Simple ru text{% endif %}
                {% if locale == "en" %}Simple en text{% endif %}
                Simple text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {locale: 'ru'},
            });

            const result = await loader.call(context, content);

            expect(result).toEqual('Simple ru text\nSimple text');
        });

        it('should not template conditions if disabled 1', async () => {
            const content = dedent`
                {% if locale == "ru" %}Simple ru text{% endif %}
                {% if locale == "en" %}Simple en text{% endif %}
                Simple text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {locale: 'ru'},
                options: {disableLiquid: true},
            });

            const result = await loader.call(context, content);

            expect(result).toEqual(content);
        });

        it('should not template conditions if disabled 2', async () => {
            const content = dedent`
                {% if locale == "ru" %}Simple ru text{% endif %}
                {% if locale == "en" %}Simple en text{% endif %}
                Simple text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                vars: {locale: 'ru'},
                settings: {conditions: false},
            });

            const result = await loader.call(context, content);

            expect(result).toEqual(content);
        });
    });

    describe('resolveDependencies', () => {
        it('should detect dependency', async () => {
            const content = dedent`
                Simple text
                {% include [](./include.md) %}
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setDependencies).toBeCalledWith('file.md', [
                {path: 'include.md', location: [12, 42], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should detect dependencies', async () => {
            const content = dedent`
                Simple text
                {% include [](./include1.md) %}

                {% include [some text (with) braces](./include2.md) %}

                    {% include [](./deep/include.md) %}

                text
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setDependencies).toBeCalledWith('file.md', [
                {path: 'include1.md', location: [12, 43], hash: null, search: null},
                {path: 'include2.md', location: [45, 99], hash: null, search: null},
                {path: 'deep/include.md', location: [105, 140], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });
    });

    describe('resolveAssets', () => {
        it('should detect asset', async () => {
            const content = dedent`
                Simple text
                ![img](./some.png)
                ![img](\\_images/auth\\_3.png)
                ![img](<link.png>)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some.png', location: [17, 30], hash: null, search: null},
                {
                    path: '_images/auth_3.png',
                    location: [36, 59],
                    hash: null,
                    search: null,
                },
                {path: 'link.png', location: [65, 76], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should detect link asset', async () => {
            const content = dedent`
                Simple text
                [link](./some.png)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some.png', location: [17, 30], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should detect link image asset', async () => {
            const content = dedent`
                Simple text
                [![img](./some.png)](./some-big.png)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some.png', location: [18, 31], hash: null, search: null},
                {path: 'some-big.png', location: [31, 48], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should skip no media content', async () => {
            const content = dedent`
                Simple text
                [link1](./some.tx)
                [link2](./some.doc)
                @[video](./some.webm)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', []);
            expect(result).toEqual(content);
        });

        it('should skip external content', async () => {
            const content = dedent`
                Simple text
                [link1](//example.com/some.png)
                [link2](https://example.com/some.png)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', []);
            expect(result).toEqual(content);
        });

        it('should work with sized images', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png =100x100)
                ![img](./some2.png =x100)
                ![img](./some3.png =100x)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some1.png', location: [17, 31], hash: null, search: null},
                {path: 'some2.png', location: [46, 60], hash: null, search: null},
                {path: 'some3.png', location: [72, 86], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should work with spaced images', async () => {
            const content = dedent`
                Simple text
                ![img]( ./some1.png)
                ![img](./some2.png )
                ![img]( ./some3.png )
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some1.png', location: [17, 32], hash: null, search: null},
                {path: 'some2.png', location: [38, 52], hash: null, search: null},
                {path: 'some3.png', location: [59, 74], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should work with case sensitive images', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.PNG)
                ![img](./some2.pnG)
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some1.PNG', location: [17, 31], hash: null, search: null},
                {path: 'some2.pnG', location: [37, 51], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should work with references', async () => {
            const content = dedent`
                Simple text
                [img]: ./some1.png
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'some1.png', location: [12, 30], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });

        it('should work with deflists', async () => {
            const content = dedent`
                **Term 1**

                :   Definition 1

                    ![](image.jpeg)

            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setAssets).toBeCalledWith('file.md', [
                {path: 'image.jpeg', location: [36, 49], hash: null, search: null},
            ]);
            expect(result).toEqual(content);
        });
    });

    describe('resolveHeadings', () => {
        it('should detect common heading', async () => {
            const content = dedent`
                # Heading 1

                Text
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setHeadings).toBeCalledWith('file.md', [
                {content: '# Heading 1', location: [0, 11]},
            ]);
            expect(result).toEqual(content);
        });

        it('should detect alternate heading', async () => {
            const content = dedent`
                Heading 1
                Multiline
                =========

                Text
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setHeadings).toBeCalledWith('file.md', [
                {content: 'Heading 1\nMultiline\n=========', location: [0, 29]},
            ]);
            expect(result).toEqual(content);
        });

        it('should detect mixed headings', async () => {
            const content = dedent`
                # Heading 1

                Heading 2
                Multiline
                =========

                # Heading 3

                Text
            `;
            const context = loaderContext(content, {
                mode: 'md',
            });

            const result = await loader.call(context, content);
            expect(context.markdown.setHeadings).toBeCalledWith('file.md', [
                {content: '# Heading 1', location: [0, 11]},
                {content: 'Heading 2\nMultiline\n=========', location: [13, 42]},
                {content: '# Heading 3', location: [44, 55]},
            ]);
            expect(result).toEqual(content);
        });
    });

    describe('applyPlugins', () => {
        it('should apply plugins', async () => {
            const content = dedent`
                Text
            `;
            const context = loaderContext(content, {
                mode: 'md',
                plugins: [
                    async function (input: string) {
                        return input + '\nPlugin 1';
                    },
                    async function (input: string) {
                        return input + '\nPlugin 2';
                    },
                ],
            });

            const result = await loader.call(context, content);
            expect(result).toEqual('Text\nPlugin 1\nPlugin 2');
        });
    });
});
