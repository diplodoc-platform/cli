import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parse} from 'node-html-parser';
import {expect, test} from 'vitest';

import runner from '../fixtures/runner';

function renderedPage(html: string) {
    const page = parse(html);
    const encoded = page.querySelector('script#diplodoc-state')?.rawText;
    if (!encoded) throw new Error('Expected emitted Diplodoc page state');
    const state: {data: {html: string; meta: {script?: string[]; style?: string[]}}} = JSON.parse(
        encoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
    );
    const content = parse(state.data.html);
    const refs = content
        .querySelectorAll('.footnote-ref a')
        .map((node) => node.getAttribute('href'));
    const footnoteIds = content
        .querySelectorAll('[id]')
        .map((node) => node.id)
        .filter((id) => id.startsWith('yfm-fn-'));
    for (const href of refs) {
        expect(href).toMatch(/^#/);
        expect(content.querySelectorAll(`[id="${href?.slice(1)}"]`)).toHaveLength(1);
    }
    expect(new Set(footnoteIds).size).toBe(footnoteIds.length);
    expect(content.querySelector('pre')?.textContent).toContain(':::cut [Code literal]');
    expect(state.data.meta.script ?? []).toEqual([]);
    expect(state.data.meta.style ?? []).toEqual([]);
    return {
        cuts: content.querySelectorAll('details.yfm-cut').length,
        nestedCuts: content.querySelectorAll('details.yfm-cut details.yfm-cut').length,
        notes: content.querySelectorAll('.yfm-note').length,
        tabs: content.querySelectorAll('.yfm-tabs').length,
        tasks: content.querySelectorAll('input[type="checkbox"][disabled]').length,
        refs,
        backrefs: content.querySelectorAll('.footnote-backref').length,
        variants: content
            .querySelectorAll('.yfm-tabs')
            .map((node) => node.getAttribute('data-diplodoc-variant')),
        groups: content
            .querySelectorAll('.yfm-tabs')
            .map((node) => node.getAttribute('data-diplodoc-group')),
        panels: content.querySelectorAll('.yfm-tab-panel').map((node) => node.id),
        selected: content
            .querySelectorAll('.yfm-tab-panel.active')
            .map((node) => node.textContent.trim()),
        resources: page
            .querySelectorAll('script[src],link[href]')
            .map((node) => node.getAttribute('src') || node.getAttribute('href'))
            .filter((url) => url && /\.(js|css)$/.test(url)),
    };
}

test.each(['regular', 'radio', 'dropdown', 'accordion'])(
    'preserves colon %s through direct HTML, default MD and rebuilt HTML',
    async (variant) => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-colon-blocks-')));
        const input = join(root, 'input');
        const direct = join(root, 'direct');
        const md = join(root, 'md');
        const rebuilt = join(root, 'rebuilt');
        const child = `::::cut [Outer]

:::note [Note title] {type=tip}

Nested note body.

:::

{% cut "Legacy inner" %}

Legacy body.

{% endcut %}

{% include [grand](grand.md) %}

::::

:::tabs {variant=${variant} group="shared"}

- First

  One[^a].

- Second {selected}

  Two

:::

- [x] Done

[^a]: Child footnote.
`;
        try {
            await mkdir(input);
            await writeFile(
                join(input, 'toc.yaml'),
                'items:\n  - name: Page\n    href: index.md\n',
            );
            await writeFile(
                join(input, 'index.md'),
                '# Page\n\n{% include [first](child.md) %}\n\n{% include [second](child.md) %}\n\n```text\n:::cut [Code literal]\n```\n',
            );
            await writeFile(join(input, 'child.md'), child);
            await writeFile(
                join(input, 'grand.md'),
                ':::note {type=info}\n\nGrand reference[^g].\n\n:::\n\n[^g]: Grand footnote.\n',
            );
            for (const [source, output, extra] of [
                [input, direct, []],
                [input, md, ['-f', 'md']],
                [md, rebuilt, []],
            ] as const) {
                const result = await runner.runRaw([
                    '-i',
                    source,
                    '-o',
                    output,
                    '--id-generator',
                    'constant',
                    ...extra,
                ]);
                expect(result.code, result.stderr).toBe(0);
                expect(result.stdout + result.stderr).not.toMatch(
                    /LEGACY_(CUT|TABS|NOTES)_CALLBACK/,
                );
            }
            expect(await readFile(join(md, 'index.md'), 'utf8')).toContain(
                '{% include [first](child.md) %}',
            );
            // Default MD preserves scoped children as embedded included blocks.
            const authored = await readFile(join(md, 'index.md'), 'utf8');
            expect(authored).toContain('::::cut [Outer]');
            expect(authored).toContain(':::note [Note title] {type=tip}');
            expect(authored).toContain(`:::tabs {variant=${variant} group="shared"}`);
            expect(authored).toContain('- Second {selected}');
            const first = renderedPage(await readFile(join(direct, 'index.html'), 'utf8'));
            const second = renderedPage(await readFile(join(rebuilt, 'index.html'), 'utf8'));
            expect(first).toMatchObject({
                cuts: 4,
                nestedCuts: 2,
                notes: 4,
                tabs: 2,
                tasks: 2,
                backrefs: 4,
                variants: [variant, variant],
                groups: ['shared', 'shared'],
                selected: ['Two', 'Two'],
            });
            expect(first.refs).toHaveLength(4);
            // Cached repeated Tabs panel IDs retain their existing baseline behavior.
            // Only footnote ownership is required to be unique above.
            expect(second).toEqual(first);
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    },
);
