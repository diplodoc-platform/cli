import {LogLevels} from '@diplodoc/yfmlint';
import {afterEach, expect, it, vi} from 'vitest';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
    'shares inline syntax with the real renderer and SDK lint parser (attrs=%s)',
    async (enableMarkdownAttrs) => {
        const observed: unknown[] = [];
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            allowHtml: true,
            sanitizeHtml: true,
            content: {maxInlineSvgSize: 1024},
            enableMarkdownAttrs,
            lint: {enabled: true, config: {default: false, YFM024: {loglevel: LogLevels.ERROR}}},
        });
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue([
            ...getBaseMdItPlugins(),
            (md, options) => {
                md.core.ruler.after('inline', 'capture_inline_syntax', (state) => {
                    observed.push({
                        attrs: options.enableMarkdownAttrs,
                        inline: state.tokens
                            .filter((token) => token.type === 'inline')
                            .map((token) =>
                                token.children?.map(({type, content, markup}) => ({
                                    type,
                                    content,
                                    markup,
                                })),
                            ),
                    });
                });
            },
        ]);
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
        const file = normalizePath('en/inline.md');
        const source =
            '# ++Title++ H~two~O\n\n++Body **bold**++ [++Label++ H~two~O](https://example.com) ~~old~~.\n';
        const [html, env] = await run.transform(file, source, {deps: [], assets: []});
        const errors = await run.lint(file, source, {deps: [], assets: []});
        expect(env.title).toBe('<u>Title</u> H<sub>two</sub>O');
        expect(html).toContain('<u>Body <strong>bold</strong></u>');
        expect(html).toContain('<u>Label</u> H<sub>two</sub>O</a>');
        expect(html).toContain('<s>old</s>');
        expect(errors).toEqual([]);
        expect(observed).toHaveLength(2);
        expect(observed[0]).toEqual(observed[1]);
        expect(JSON.stringify(observed[0])).toContain('underline_open');
        expect(JSON.stringify(observed[0])).toContain('sub_open');
    },
);
