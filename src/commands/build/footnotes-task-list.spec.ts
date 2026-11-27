import {afterEach, expect, it, vi} from 'vitest';
import {LogLevels} from '@diplodoc/yfmlint';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';

afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
    'renders and lints footnotes and tasks on actual CLI parser, attrs=%s',
    async (enableMarkdownAttrs) => {
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 1024},
            enableMarkdownAttrs,
            lint: {enabled: true, config: {default: false, YFM024: {loglevel: LogLevels.ERROR}}},
        });
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
        const source = '# Heading\n\n- [x] Done[^a]\n\n[^a]: Footnote body.\n';
        const file = normalizePath('en/footnotes.md');
        const [html] = await run.transform(file, source, {deps: [], assets: []});
        expect(html).toContain('Footnote body.');
        expect(html).toContain('footnote-ref');
        expect(html).toContain('checkbox');
        expect(await run.lint(file, source, {deps: [], assets: []})).toEqual([]);
    },
);

it('admits an included footnote through the real CLI detector and renderer', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    const source = `# Root

{% include [part](part.md) %}

{% included (part.md) %}
Child ref[^child].

[^child]: Child footnote.
{% endincluded %}
`;
    const [html] = await run.transform(normalizePath('en/root.md'), source, {deps: [], assets: []});
    expect(html).toContain('Child ref');
    expect(html).toContain('Child footnote.');
    expect(html).toContain('footnote-backref');
});

it('gives repeated included footnotes independent references and backlinks', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    const source = `# Root

{% include [one](part.md) %}

{% include [two](part.md) %}

{% included (part.md) %}
Child ref[^x].

[^x]: Shared child body.
{% endincluded %}
`;
    const [html] = await run.transform(normalizePath('en/root.md'), source, {deps: [], assets: []});
    expect(html.match(/Shared child body\./g)).toHaveLength(2);
    expect(html.match(/class="footnote-ref"/g)).toHaveLength(2);
    expect(html.match(/class="footnote-backref"/g)).toHaveLength(2);
    const ids = [...html.matchAll(/id="(yfm-fn-[^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
});

it.each([false, true])(
    'reuses plain include inside and outside footnote body, inside first=%s',
    async (insideFirst) => {
        const run = setupRun({
            langs: ['en'],
            idGenerator: 'constant',
            content: {maxInlineSvgSize: 1024},
        });
        vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
        vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
        const outside = '{% include [outside](part.md) %}';
        const inside = 'Reference[^a].\n\n[^a]: Body.\n\n    {% include [inside](part.md) %}';
        const source = `# Root\n\n${insideFirst ? inside : outside}\n\n${insideFirst ? outside : inside}\n\n{% included (part.md) %}\n## Included heading\n\nPlain child body.\n{% endincluded %}\n`;
        const [html] = await run.transform(normalizePath('en/root.md'), source, {
            deps: [],
            assets: [],
        });
        expect(html.match(/Plain child body\./g)).toHaveLength(2);
        expect(html.match(/id="included-heading"/g)).toHaveLength(1);
        expect(html.match(/footnote-backref/g)).toHaveLength(1);
    },
);

it('attributes actual lint diagnostics through repeated nested includes', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
        lint: {
            enabled: true,
            config: {default: false, YFM003: {loglevel: LogLevels.ERROR}, YFM025: false},
        },
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue([
        ...getBaseMdItPlugins(),
        (md) =>
            md.core.ruler.after('includes', 'mark_test_link', (state) => {
                for (const token of state.tokens) {
                    for (const child of token.children ?? []) {
                        const href = child.attrGet('href');
                        if (
                            child.type === 'link_open' &&
                            typeof href === 'string' &&
                            href.endsWith('#missing')
                        )
                            child.attrSet('YFM003', 'test');
                    }
                }
            }),
    ]);
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    vi.mocked(run.exists).mockReturnValue(false);
    const source = `# Root

{% include [a](a.md) %}

{% include [a](a.md) %}

{% included (a.md) %}
{% include [b](b.md) %}
{% endincluded %}

{% included (b.md) %}
[Missing](#missing)
{% endincluded %}
`;
    const errors = await run.lint(normalizePath('en/root.md'), source, {deps: [], assets: []});
    expect(errors).toHaveLength(2);
    expect(errors?.map((error) => error.errorContext)).toEqual([
        expect.stringContaining('en/root.md:3 → en/a.md:1 → en/b.md:1'),
        expect.stringContaining('en/root.md:5 → en/a.md:1 → en/b.md:1'),
    ]);
});

it('keeps same-label footnotes from sibling includes independent', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    const source = `# Root

{% include [a](a.md) %}

{% include [b](b.md) %}

{% included (a.md) %}
First[^x].

[^x]: First definition.
{% endincluded %}

{% included (b.md) %}
Second[^x].

[^x]: Second definition.
{% endincluded %}
`;
    const [html] = await run.transform(normalizePath('en/root.md'), source, {deps: [], assets: []});
    expect(html.match(/First definition\./g)).toHaveLength(1);
    expect(html.match(/Second definition\./g)).toHaveLength(1);
    expect(html.match(/class="footnote-backref"/g)).toHaveLength(2);
    const ids = [...html.matchAll(/id="(yfm-fn-[^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
});

it('admits a selected section without its heading and retains reachable footnote', async () => {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    const source = `# Root

{% include notitle [part](part.md#selected) %}

{% included (part.md) %}
## Selected {#selected}

Chosen[^x].

## Other

Not selected.

[^x]: Selected definition.
{% endincluded %}
`;
    const [html] = await run.transform(normalizePath('en/root.md'), source, {deps: [], assets: []});
    expect(html).toContain('Chosen');
    expect(html).toContain('Selected definition.');
    expect(html).not.toContain('Not selected.');
    expect(html).not.toContain('>Selected</');
    expect(html.match(/class="footnote-backref"/g)).toHaveLength(1);
});

it('allocates no footnote ID for missing selections and allocates once for admitted content across recompiles', async () => {
    const {default: transformer} = await import('@diplodoc/transform/parser');
    const {getLogger} = await import('@diplodoc/transform/log');
    const generateID = vi.fn(() => 'generated-once');
    const parser = transformer({
        plugins: [
            ...getBaseMdItPlugins(),
            (md) =>
                md.core.ruler.push('test_child_resource', (state) => {
                    if (state.env.path === 'part.md')
                        state.env.meta = {script: ['child-resource.js']};
                }),
        ],
        path: 'root.md',
        files: {'part.md': '## Selected {#selected}\n\nRef[^x].\n\n[^x]: Body.\n'},
        generateID,
        log: getLogger({error: () => {}, warn: () => {}, info: () => {}}),
    });
    const missing = parser.parseDocument('{% include [missing](part.md#missing) %}');
    parser.compileDocument(missing);
    expect(missing.env.meta?.script ?? []).not.toContain('child-resource.js');
    expect(generateID).not.toHaveBeenCalled();
    const admitted = parser.parseDocument('{% include [part](part.md) %}');
    const first = parser.compileDocument(admitted);
    const second = parser.compileDocument(admitted);
    expect(first).toBe(second);
    expect(first).toContain('Body.');
    expect(admitted.env.meta?.script).toContain('child-resource.js');
    expect(generateID).toHaveBeenCalledTimes(1);
});
