import type {Mock} from 'vitest';
import type {Collect} from './types';
import type {LoaderContext} from './loader';
import type * as CoreUtils from '~/core/utils';

import {describe, expect, it, vi} from 'vitest';
import {dedent} from 'ts-dedent';
import {SourceMap} from '@diplodoc/liquid';

import {Logger} from '~/core/logger';

import {loader} from './loader';

vi.mock('~/core/logger');
vi.mock('~/core/utils', async (importOriginal) => {
    const actual = (await importOriginal()) as typeof CoreUtils;
    return {
        ...actual,
        fs: {
            ...actual.fs,
            statSync: vi.fn(() => ({size: 1024})),
        },
    };
});

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
        fullPath: (path: RelativePath) => path,
        input: '/' as AbsolutePath,
        api: {
            blockCodes: bucket(),
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
            mergeContentParts: true,
            ...options,
        },
        mode: 'build',
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

        it('should error on duplicated key in frontmatter', async () => {
            const content = dedent`
                ---
                title: Test Document
                title: Duplicate Key
                ---
                Simple text
            `;
            const context = loaderContext(content);
            context.logger.error = Object.assign(vi.fn(), {count: 0});

            await loader.call(context, content);

            expect(context.logger.error).toBeCalledWith(
                'file.md: 2: YFM017 / invalid front matter format [Reason: "duplicated mapping key"; Line: 2; Key: "title"]',
            );
        });

        it('should not error on duplicated vcsPath in frontmatter', async () => {
            const content = dedent`
                ---
                title: Test Document
                vcsPath: path/one.md
                vcsPath: path/two.md
                ---
                Simple text
            `;
            const context = loaderContext(content);
            context.logger.error = Object.assign(vi.fn(), {count: 0});

            await loader.call(context, content);

            expect(context.logger.error).not.toBeCalled();
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

    describe('resolveBlockCodes', () => {
        it('should skip assets in fenced code blocks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`
                ![img](./some2.png)
                \`\`\`
                ![img](./some3.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect asset in inline code with text', async () => {
            const content = dedent`
                Simple text with \`![img](./some.png)\` in the middle
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect asset in multiline definition list', async () => {
            const content = dedent`
                Term
                :   Definition with 
                
                    ![img](./some.png)
                    and more text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in code blocks inside multiline definition list', async () => {
            const content = dedent`
                Term
                :   Definition with code:
                    \`\`\`
                    ![img](./some.png)
                    \`\`\`
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in code blocks with mixed indentation', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                    \`\`\`
                    ![img](./some2.png)
                        ![img](./some3.png)
                    \`\`\`
                ![img](./some4.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in code blocks with special characters', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`
                const regex = /[\w]+/g;
                const str = 'Hello {name}!';
                console.log(\`Result: \${str}\`);
                \`\`\`
                ![img](./some2.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should handle empty code blocks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`
                \`\`\`
                ![img](./some2.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in fenced code blocks with tildes', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                ~~~
                ![img](./some2.png)
                ~~~
                ![img](./some3.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should handle code blocks with only whitespace', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`
                    
                     
                \`\`\`
                ![img](./some2.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in code blocks inside lists', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                - Item 1
                    \`\`\`
                    ![img](./some2.png)
                    \`\`\`
                - Item 2 
                  ![img](./some3.png)
                ![img](./some4.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should handle adjacent code blocks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`
                code block 1
                \`\`\`
                \`\`\`
                code block 2
                \`\`\`
                ![img](./some2.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in indented code blocks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                    ![img](./some2.png)
                    ![img](./some3.png)
                ![img](./some4.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in inline code with double backticks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`![img](./some2.png)\`\`
                ![img](./some3.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in code blocks with language specification', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`javascript
                ![img](./some2.png)
                \`\`\`
                ![img](./some3.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in inline code', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`![img](./some2.png)\`
                ![img](./some3.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should add assets in definition list', async () => {
            const content = dedent`
                Title
                :   Simple text:
                
                    ![img](./some1.png)

                    #|
                    || ![img](./some2.png) | col2

                    ||
                    |#
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should add assets in definition list with note', async () => {
            const content = dedent`
                {% note warning %}
                Text warning. 

                ![img](./some1.png)

                \`\`\`shell
                some text in block
                ![img](./some2.png)
                \`\`\`
                {% endnote %}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
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

        it('should filter dependencies inside fenced code blocks', async () => {
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
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps).toHaveLength(2);
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['include1.md', 'include2.md']);
            expect(result).toEqual(content);
        });

        it('should filter dependencies inside fenced code blocks indented in lists', async () => {
            // Real-world scenario from intranet/idm/internal/concepts/documentation.md:
            // a `{% include %}` shown as a code example inside an ordered list
            // (the fence itself is indented by 4 spaces under `1.`) must NOT
            // be treated as a real dependency.
            const content = dedent`
                Simple text
                {% include [](./include1.md) %}

                1. Step one:

                    \`\`\`plaintext
                    {% include [](./inside-fence.md) %}
                    [*glossary]: text
                    \`\`\`

                {% include [](./include2.md) %}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['include1.md', 'include2.md']);
            expect(result).toEqual(content);
        });

        it('should filter dependencies inside tilde-fenced code blocks', async () => {
            const content = dedent`
                {% include [](./real.md) %}

                ~~~yaml
                {% include [](./fake.md) %}
                ~~~
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['real.md']);
            expect(result).toEqual(content);
        });

        it('should keep an include that starts on the line right after a closing fence', async () => {
            // Regression for the "Include skipped in" failure observed on
            // ~50 real metrika pages: an `{% include %}` placed immediately
            // after a closing ``` fence (no blank line in between) used to
            // be dropped because the fence range ended exactly at the
            // start of the include line and `filterRanges` treats touching
            // ranges as overlapping.
            const content = dedent`
                Pre text

                \`\`\`javascript
                <script>console.log(1)</script>
                \`\`\`
                {% include [chat-button](./chat.md) %}

                {% include [next](./next.md) %}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['chat.md', 'next.md']);
            expect(result).toEqual(content);
        });

        it('should keep includes after an unterminated ``` opener with content-like info string', async () => {
            // Regression for metrika `pt/objects/first-party-params.md`:
            // an inline-styled fence written as ` \`\`\`javascript foo({...} ` that is
            // never closed (the line ends with `})\`\`\``, which is NOT a valid
            // CommonMark closer because text precedes the backticks) used to
            // extend a fence range to EOF and silently drop every real
            // `{% include %}` after it.  Now an unterminated opener is
            // discarded and includes after it are preserved.
            const content = dedent`
                # Title

                \`\`\`javascript
                ym(XXX, 'init');
                \`\`\`

                \`\`\`javascript ym(XXX, 'firstPartyParams', {
                    "e-mail": 'a@b.com',
                });\`\`\`

                {% include [chat-button](./chat.md) %}

                {% include [support-button](./support.md) %}

                {% include [footer-links](./footer.md) %}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual([
                'chat.md',
                'support.md',
                'footer.md',
            ]);
            expect(result).toEqual(content);
        });

        it('should treat a `\`\`\` |` line as a valid closer (YFM table cell separator after fence)', async () => {
            // Regression for browser-corporate `ru/policy/cookies-allowed-for-urls.md`:
            // a code fence inside a YFM shorthand cell often ends with the
            // table separator on the same line as the closer (e.g. ` ``` |`).
            // CommonMark forbids non-whitespace content after the closer, so
            // our detector used to refuse to pair this as a closer — and
            // then later (`\`\`\``) line in the next cell was wrongly
            // treated as the closer, swallowing all `{% include %}` between.
            const content = dedent`
                #|
                || **Header** | **Content** ||
                || row1 |
                \`\`\`json
                {"a": 1}
                \`\`\` |
                paragraph

                {% include [a](./a.md) %}
                {% include [b](./b.md) %}

                \`\`\`json
                {"b": 2}
                \`\`\`
                ||
                |#
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['a.md', 'b.md']);
            expect(result).toEqual(content);
        });

        it('should not treat fence runs inside an HTML comment as a real fence', async () => {
            // Regression for yateam `datasync/http/ru/dg/concepts/data-structure.md`:
            // an HTML comment contains a sample code fence (` ```javascript … ``` `),
            // and the regex-based detector saw the `\`\`\` -->` line as a
            // fence opener (info string `-->`).  The next real `\`\`\``
            // closed it, producing a phantom range that swallowed the
            // deflist `{% include %}` blocks between them.
            const content = dedent`
                Some intro paragraph.

                <!-- \`\`\`javascript
                code-like
                \`\`\` -->

                #### record
                 
                :   {% include [record](./_includes/record.md) %}

                #### fields
                 
                :   {% include [fields](./_includes/fields.md) %}

                \`\`\`javascript
                actual code
                \`\`\`
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual([
                '_includes/record.md',
                '_includes/fields.md',
            ]);
            expect(result).toEqual(content);
        });

        it('should keep includes when a fence is mis-paired in deeply indented deflist context', async () => {
            // Regression for webmaster `ru/search-appearance/images-goods.md`:
            // a definition list (`:   ` marker) opens a fence on the SAME
            // line as the marker.  Our regex-based detector cannot pair
            // that opener (the line starts with `:`, not a backtick), so
            // the real closer was treated as a fresh opener and the next
            // fence cycle ended up "unterminated", extending to EOF and
            // dropping every include below it.  Dropping the unterminated
            // branch keeps those includes in deps.
            const content = dedent`
                **Heading**

                 
                :   \`\`\`
                    <html>code</html>
                    \`\`\`

                    \`\`\`
                    more code
                    \`\`\`

                    {% include [validate](./validate.md) %}

                {% include [footer](./footer.md) %}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            const deps = (context.api.deps.set as Mock).mock.calls[0][0];
            expect(deps.map((d: {path: string}) => d.path)).toEqual(['validate.md', 'footer.md']);
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect link asset', async () => {
            const content = dedent`
                Simple text
                [link](./some.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);

            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect link image asset', async () => {
            const content = dedent`
                Simple text
                [![img](./some.png)](./some-big.png)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with sized images format options', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png){width=100 height=100}
                ![img](./some2.png){width=100}
                ![img](./some3.png){height=100}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with inline svg images', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.svg){inline=true}
                ![img](./some2.svg){inline=false}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with references', async () => {
            const content = dedent`
                Simple text
                [img]: ./some1.png
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should skip assets in nested code blocks', async () => {
            const content = dedent`
                Simple text
                ![img](./some1.png)
                \`\`\`\`
                \`\`\`
                ![img](./some2.png)
                \`\`\`
                ![img](./some3.png)
                \`\`\`\`
                ![img](./some4.png)
            `;
            const context = loaderContext(content, {});
            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0][0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should not detect asset with long fence', async () => {
            const content = dedent`
                Simple text
                \`\`\`\`\`\`\`\`\`
                ![img](./some.png)
                \`\`\`\`\`\`\`\`\`
                Simple text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should not detect asset with language and translate=no directive', async () => {
            const content = dedent`
                Simple text
                \`\`\`javascript translate=no
                ![img](./some.png)
                \`\`\`
                Simple text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect link to anchor', async () => {
            const content = dedent`
                Simple text
                [link](#anchor)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);

            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with reference images with title', async () => {
            const content = dedent`
                Simple text
                ![title][code]
                ![code][]

                [code]: ./some.png
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with images with parameters', async () => {
            const content = dedent`
                Simple text
                ![title](./some1.png){width=100 height=200}
                ![title](./some2.png){width=100}
                ![title](./some3.png){height=200}
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with reference images with parameters', async () => {
            const content = dedent`
                Simple text
                ![title][code]{width=100 height=200}
                ![code][]{width=100}

                [code]: ./some.png
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect html anchor with download attribute (href first)', async () => {
            const content = dedent`
                Simple text
                <a href="_assets/test.txt" download="Config">Download</a>
                <a href="_assets/test.docx" download>Download</a>
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should detect html anchor with download attribute (download first)', async () => {
            const content = dedent`
                Simple text
                <a download="Config" href="_assets/test.csv">Download</a>
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should not detect html anchor without download attribute', async () => {
            const content = dedent`
                Simple text
                <a href="_assets/test.txt">Not a download</a>
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should not detect html anchor with external href and download', async () => {
            const content = dedent`
                Simple text
                <a href="https://example.com/file.txt" download>External</a>
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should not detect html anchor with download but unsupported format', async () => {
            const content = dedent`
                Simple text
                <a href="_assets/archive.zip" download>Download</a>
                <a href="_assets/report.pdf" download>Download</a>
                <a href="_assets/data.xlsx" download>Download</a>
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with images with title backtick', async () => {
            const content = dedent`
                Simple text
                ![Text link \`backtick\`](./some1.png "Text link title \`backtick\`"){ width="800" }

                ![Text link \`backtick\`](./some2.png "Text link title \`backtick\`"){ width="800" }
                Text on next row with inline code \`backtick\`.

                ![Text link \`backtick1\`](./some3.png "Text link title \`backtick\`" =800x)
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with images in yfm table after code block', async () => {
            const content = dedent`
                #|
                || **col1** | **col2** | **col3** ||
                || col1 | 
                \`\`\`swift 
                some code
                \`\`\` | ![](./some.png =120x) ||
                |#
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
            expect(result).toEqual(content);
        });

        it('should work with popup with % in name or text', async () => {
            const content = dedent`
                [link 1](*link1)
                [link 2%](*link2%)

                [*link1]: 100% text with
                [*link2%]: some text
            `;
            const context = loaderContext(content, {});

            const result = await loader.call(context, content);
            expect((context.api.assets.set as Mock).mock.calls[0]).toMatchSnapshot();
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

    describe('resolve no-translate directive', () => {
        it('should remove no-translate directive but leave its content', async () => {
            const content = dedent`
                ::: no-translate
                Should not be
                translated
                :::
            `;
            const context = loaderContext(content);

            const result = await loader.call(context, content);

            expect(result).toEqual(
                dedent`
                    Should not be
                    translated
                `,
            );
        });

        it('should remove no-translate directive but leave nested directives unchanged', async () => {
            const content = dedent`
                ::: no-translate
                Should not be
                translated
                ::: some-other-directive
                Some other directive
                :: some-other-inline-directive with text. : item-directive [attr]
                content
                :::
                :::
            `;
            const context = loaderContext(content);

            const result = await loader.call(context, content);

            expect(result).toEqual(
                dedent`
                    Should not be
                    translated
                    ::: some-other-directive
                    Some other directive
                    :: some-other-inline-directive with text. : item-directive [attr]
                    content
                    :::
                `,
            );
        });
    });
});
