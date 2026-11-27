import {LogLevels} from '@diplodoc/yfmlint';
import {afterEach, expect, it, vi} from 'vitest';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';

afterEach(() => vi.restoreAllMocks());

it.each([undefined, true, false])(
    'keeps renderer and actual lint policy together for configured attrs=%s',
    async (enableMarkdownAttrs) => {
        const observed: unknown[] = [];
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            allowHtml: true,
            sanitizeHtml: true,
            content: {maxInlineSvgSize: 1024},
            enableMarkdownAttrs,
            lint: {
                enabled: true,
                config: {default: false, YFM024: {loglevel: LogLevels.ERROR}, YFM025: false},
            },
        });
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue([
            ...getBaseMdItPlugins(),
            (_md, options) => observed.push(options.enableMarkdownAttrs),
        ]);
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
        const file = normalizePath('en/attrs.md');
        const source = '# Heading\n\nParagraph {#paragraph .extra}\n\n## Marked {YFM024=true}';
        const [html] = await run.transform(file, source, {deps: [], assets: []});
        const errors = await run.lint(file, source, {deps: [], assets: []});
        const enabled = enableMarkdownAttrs ?? true;

        expect(html.includes('id="paragraph"')).toBe(enabled);
        expect(html.includes('class="extra"')).toBe(enabled);
        expect(errors).toHaveLength(enabled ? 1 : 0);
        if (enabled) expect(errors?.[0].ruleNames).toContain('YFM024');
        expect(observed).toEqual([enabled, enabled]);

        const suppressed = await run.lint(file, '<!-- markdownlint-disable YFM024 -->\n' + source, {
            deps: [],
            assets: [],
        });
        expect(suppressed).toEqual([]);
    },
);
