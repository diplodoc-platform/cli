import type {Collect} from './types';
import type {LoaderContext} from './loader';

import {describe, expect, it, vi} from 'vitest';
import {dedent} from 'ts-dedent';
import {SourceMap} from '@diplodoc/liquid';

import {Logger} from '~/core/logger';

import {loader} from './loader';

vi.mock('~/core/logger');

function bucket() {
    let _value: unknown;

    return {
        get: vi.fn(() => _value),
        set: vi.fn((value) => {
            _value = value;
        }),
    };
}

function loaderContext(
    raw: string,
    {
        vars = {},
        options = {},
        settings = {},
        collects = [] as Collect[],
    }: DeepPartial<LoaderContext> = {},
) {
    return {
        path: 'file.md' as NormalizedPath,
        vars,
        logger: new Logger(),
        emitFile: vi.fn(),
        readFile: vi.fn(),
        api: {
            deps: bucket(),
            assets: bucket(),
            meta: bucket(),
            info: bucket(),
            headings: bucket(),
            comments: bucket(),
            sourcemap: bucket(),
        },
        collects: collects as Collect[],
        sourcemap: new SourceMap(raw),
        settings,
        options: {
            disableLiquid: false,
            ...options,
        },
    } as LoaderContext;
}

describe('Markdown loader', () => {
    it('should process simple text', async () => {
        const content = dedent`
            Simple text
        `;
        const context = loaderContext(content);

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
            const context = loaderContext(content);

            const result = await loader.call(context, content);

            expect(context.api.meta.set).toBeCalledWith({prop: 'value'});
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
                vars: {text: 'text'},
            });

            const result = await loader.call(context, content);

            expect(context.api.meta.set).toBeCalledWith({prop: 'text'});
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
                vars: {text: 'text'},
                options: {disableLiquid: true},
            });

            const result = await loader.call(context, content);

            expect(context.api.meta.set).toBeCalledWith({prop: '{{text}}'});
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
            const context = loaderContext(content, {vars: {text: 'text'}});

            await loader.call(context, content);

            expect(context.api.comments.set).toHaveBeenCalledWith([[13, 39]]);
        });
    });

    describe('templateContent', () => {
        it('should template substitutions', async () => {
            const content = dedent`
                Simple {{text}}
            `;
            const context = loaderContext(content, {vars: {text: 'text'}});

            const result = await loader.call(context, content);

            expect(result).toEqual('Simple text');
        });

        it('should not template substitutions if disabled 1', async () => {
            const content = dedent`
                Simple {{text}}
            `;
            const context = loaderContext(content, {
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
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.deps.set).toBeCalledWith([
                {
                    path: 'include.md',
                    link: './include.md',
                    location: [12, 42],
                    match: '{% include [](./include.md) %}',
                    hash: null,
                    search: null,
                },
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
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.deps.set).toBeCalledWith([
                {
                    path: 'include1.md',
                    link: './include1.md',
                    location: [12, 43],
                    match: '{% include [](./include1.md) %}',
                    hash: null,
                    search: null,
                },
                {
                    path: 'include2.md',
                    link: './include2.md',
                    location: [45, 99],
                    match: '{% include [some text (with) braces](./include2.md) %}',
                    hash: null,
                    search: null,
                },
                {
                    path: 'deep/include.md',
                    link: './deep/include.md',
                    location: [105, 140],
                    match: '{% include [](./deep/include.md) %}',
                    hash: null,
                    search: null,
                },
            ]);
            expect(result).toEqual(content);
        });

        it('should filter commented dependencies', async () => {
            const content = dedent`
                Simple text
                {% include [](./include1.md) %}

                {% include [some text (with) braces](./include2.md) %}

                    <!-- {% include [](./deep/include.md) %} -->

                text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.deps.set).toBeCalledWith([
                {
                    path: 'include1.md',
                    link: './include1.md',
                    location: [12, 43],
                    match: '{% include [](./include1.md) %}',
                    hash: null,
                    search: null,
                },
                {
                    path: 'include2.md',
                    link: './include2.md',
                    location: [45, 99],
                    match: '{% include [some text (with) braces](./include2.md) %}',
                    hash: null,
                    search: null,
                },
            ]);
            expect(result).toEqual(content);
        });

        it.skip('should filter in code dependencies', async () => {
            const content = dedent`
                Simple text
                {% include [](./include1.md) %}

                {% include [some text (with) braces](./include2.md) %}

                \`\`\`
                {% include [](./deep/include.md) %}
                \`\`\`

                text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.deps.set).toBeCalledWith([
                {path: 'include1.md', location: [12, 43], hash: null, search: null},
                {path: 'include2.md', location: [45, 99], hash: null, search: null},
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
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith([
                'some.png',
                '_images/auth_3.png',
                'link.png',
            ]);
            expect(result).toEqual(content);
        });

        it('should detect link asset', async () => {
            const content = dedent`
                Simple text
                [link](./some.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some.png']);
            expect(result).toEqual(content);
        });

        it('should detect link image asset', async () => {
            const content = dedent`
                Simple text
                [![img](./some.png)](./some-big.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some.png', 'some-big.png']);
            expect(result).toEqual(content);
        });

        it('should skip commented content', async () => {
            const content = dedent`
                Simple text
                [![img](./some.png)](./some-big.png)
                <!-- [link](./some1.png) -->
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some.png', 'some-big.png']);
            expect(result).toEqual(content);
        });

        it.skip('should skip in code content', async () => {
            const content = dedent`
                Simple text
                [![img](./some.png)](./some-big.png)
                \`\`\`
                [link](./some1.png)
                \`\`\`
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some.png', 'some-big.png']);
            expect(result).toEqual(content);
        });

        it('should skip external content', async () => {
            const content = dedent`
                Simple text
                [link1](//example.com/some.png)
                [link2](https://example.com/some.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith([]);
            expect(result).toEqual(content);
        });

        it('should work with sized images', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png =100x100)
                ![img](./some2.png =x100)
                ![img](./some3.png =100x)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some1.png', 'some2.png', 'some3.png']);
            expect(result).toEqual(content);
        });

        it('should work with spaced images', async () => {
            const content = dedent`
                Simple text
                ![img]( ./some1.png)
                ![img](./some2.png )
                ![img]( ./some3.png )
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some1.png', 'some2.png', 'some3.png']);
            expect(result).toEqual(content);
        });

        it('should work with case sensitive images', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.PNG)
                ![img](./some2.pnG)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some1.PNG', 'some2.pnG']);
            expect(result).toEqual(content);
        });

        it('should work with references', async () => {
            const content = dedent`
                Simple text
                [img]: ./some1.png
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['some1.png']);
            expect(result).toEqual(content);
        });

        it('should work with deflists', async () => {
            const content = dedent`
                **Term 1**

                :   Definition 1

                    ![](image.jpeg)

            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.assets.set).toBeCalledWith(['image.jpeg']);
            expect(result).toEqual(content);
        });
    });

    describe('resolveHeadings', () => {
        it('should detect common heading', async () => {
            const content = dedent`
                # Heading 1

                Text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.headings.set).toBeCalledWith([
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
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.headings.set).toBeCalledWith([
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
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect(context.api.headings.set).toBeCalledWith([
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
                collects: [
                    async function (input: string) {
                        return input + '\nPlugin 1';
                    } as Collect,
                    async function (input: string) {
                        return input + '\nPlugin 2';
                    } as Collect,
                ],
            });

            const result = await loader.call(context, content);
            expect(result).toEqual('Text\nPlugin 1\nPlugin 2');
        });
    });
});
