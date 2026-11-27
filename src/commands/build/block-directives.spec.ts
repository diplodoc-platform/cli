import {afterEach, expect, it, vi} from 'vitest';
import {LogLevels} from '@diplodoc/yfmlint';

import {normalizePath} from '~/core/utils';

import {setupRun} from './__tests__';
import {getBaseMdItPlugins} from './features/output-html/utils';
import {inspectFootnoteSyntax} from './footnote-inspection';

afterEach(() => vi.restoreAllMocks());

function createRun(enableMarkdownAttrs = true) {
    const run = setupRun({
        langs: ['en'],
        idGenerator: 'constant',
        content: {maxInlineSvgSize: 1024},
        enableMarkdownAttrs,
        lint: {
            enabled: true,
            config: {
                default: false,
                YFM005: {loglevel: LogLevels.ERROR},
                YFM020: {loglevel: LogLevels.ERROR},
            },
        },
    });
    vi.spyOn(run.markdown, 'plugins', 'get').mockReturnValue(getBaseMdItPlugins());
    vi.spyOn(run.markdown, 'titles').mockResolvedValue({});
    return run;
}

const examples = [
    ['cut', ':::cut [Title]\n\nBody\n\n:::', 'yfm-cut'],
    ['note', ':::note [Title] {type=info}\n\nBody\n\n:::', 'yfm-note'],
    ...['regular', 'radio', 'dropdown', 'accordion'].map((variant) => [
        `tabs-${variant}`,
        `:::tabs {variant=${variant} group="shared"}\n\n- First\n\n  Body\n\n- Second {selected}\n\n  Other\n\n:::`,
        'yfm-tabs',
    ]),
];

it.each(examples)(
    'renders and lints %s through the configured CLI callbacks',
    async (_name, source, marker) => {
        for (const attrs of [false, true]) {
            const run = createRun(attrs);
            const path = normalizePath('en/blocks.md');
            const [html] = await run.transform(path, source, {deps: [], assets: []});

            expect(html).toContain(marker);
            expect(html).toContain('Body');
            expect(html).not.toContain(':::');
            expect(await run.lint(path, source, {deps: [], assets: []})).toEqual([]);
        }
    },
);

it('retains the CLI callback instances and existing 32 positions', () => {
    const first = getBaseMdItPlugins();
    const second = getBaseMdItPlugins();

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    // The native extension factory reuses the stateless OpenAPI callback.
    expect(first.filter((callback, index) => second[index] === callback)).toHaveLength(27);
    expect(first.filter((callback, index) => second[index] !== callback)).toHaveLength(5);
});

it('composes nested legacy and colon blocks with footnotes and task lists', async () => {
    const run = createRun();
    const source = `{% cut "Legacy title" %}

:::note {type=info}

- [x] Done[^x].

:::

{% endcut %}

[^x]: Footnote body.
`;
    const path = normalizePath('en/nested.md');
    const [html] = await run.transform(path, source, {deps: [], assets: []});

    expect(html).toContain('yfm-cut');
    expect(html).toContain('yfm-note');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('Footnote body.');
    expect(html).toContain('checkbox');
    expect(await run.lint(path, source, {deps: [], assets: []})).toEqual([]);
});

it.each([
    ['cut', ':::cut [Title]\n\n[^x]: Body.\n\n:::'],
    ['note', ':::note {type=info}\n\n[^x]: Body.\n\n:::'],
    ['tabs', ':::tabs\n\n- First\n\n  [^x]: Body.\n\n:::'],
])(
    'inspects a real footnote definition inside colon %s without caller effects',
    (_name, source) => {
        const run = createRun();
        const config = run['transformConfig'](normalizePath('en/inspection.md'), {});
        const generateID = vi.fn(() => 'caller-id');
        const warning = vi.spyOn(run.logger, 'warn');
        config.generateID = generateID;

        expect(inspectFootnoteSyntax(source, config)).toBe(true);
        expect(generateID).not.toHaveBeenCalled();
        expect(warning).not.toHaveBeenCalled();
    },
);

it.each([
    ['YFM005', ':::cut [Title]\n\nBody'],
    ['YFM020', ':::note {type=invalid}\n\nBody\n\n:::'],
])('reports actual %s colon diagnostics through Run.lint', async (code, source) => {
    const run = createRun();
    const result =
        (await run.lint(normalizePath('en/invalid.md'), source, {deps: [], assets: []})) ?? [];

    expect(result).toHaveLength(1);
    expect(result[0].ruleNames).toContain(code);
    expect(result[0].lineNumber).toBe(1);
    expect(result[0].errorContext).toContain(source.split('\n')[0]);
});

it('keeps separate diagnostic occurrences for a cached included invalid note', async () => {
    const run = createRun();
    const source = `{% include [one](part.md) %}

{% include [two](part.md) %}

{% included (part.md) %}
:::note {type=invalid}

Body

:::
{% endincluded %}
`;
    const result =
        (await run.lint(normalizePath('en/root.md'), source, {deps: [], assets: []})) ?? [];
    const errors = result.filter((item) => item.ruleNames.includes('YFM020'));

    expect(errors.map((item) => item.lineNumber)).toEqual([1, 3]);
    for (const item of errors) {
        expect(item.errorContext).toContain('en/part.md');
        expect(item.errorContext).toContain('processed input line 1');
        expect(item.errorContext).toContain(':::note {type=invalid}');
    }
});

it('retains nested cached colon diagnostic paths for each root occurrence', async () => {
    const run = createRun();
    const source = `# Root

{% include [first](a.md) %}

{% include [second](a.md) %}

{% included (a.md) %}
{% include [nested](b.md) %}
{% endincluded %}

{% included (b.md) %}
:::note {type=invalid}

Body

:::
{% endincluded %}
`;
    const result =
        (await run.lint(normalizePath('en/root.md'), source, {deps: [], assets: []})) ?? [];
    const errors = result.filter((item) => item.ruleNames.includes('YFM020'));

    expect(errors).toHaveLength(2);
    expect(errors.map((item) => item.lineNumber)).toEqual([3, 5]);
    expect(errors.map((item) => item.errorContext)).toEqual([
        expect.stringContaining('en/root.md:3 → en/a.md:1 → en/b.md (processed input line 1)'),
        expect.stringContaining('en/root.md:5 → en/a.md:1 → en/b.md (processed input line 1)'),
    ]);
    for (const error of errors) {
        expect(error.errorContext).toContain('processed input line 1');
        expect(error.errorContext).toContain(':::note {type=invalid}');
    }
});
