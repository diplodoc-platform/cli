import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, test} from 'vitest';

import runner from '../fixtures/runner';

async function build(input: string, output: string, ...flags: string[]) {
    const result = await runner.runRaw(['-i', input, '-o', output, ...flags]);
    expect(result.code, result.stderr).toBe(0);
}

test('preserves each included footnote scope through default Markdown and HTML builds', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-footnote-merge-')));
    const input = join(root, 'input');
    const direct = join(root, 'direct');
    const md = join(root, 'md');
    const rebuilt = join(root, 'rebuilt');
    try {
        await mkdir(input);
        await writeFile(join(input, 'toc.yaml'), 'items:\n  - name: Page\n    href: index.md\n');
        await writeFile(
            join(input, 'index.md'),
            '# Page\n\n{% include [first](child.md) %}\n\n{% include [second](child.md) %}\n',
        );
        await writeFile(join(input, 'child.md'), 'Child reference[^x].\n\n[^x]: Child body.\n');
        await build(input, direct);
        await build(input, md, '-f', 'md');
        await build(md, rebuilt);
        const directHtml = await readFile(join(direct, 'index.html'), 'utf8');
        const rebuiltHtml = await readFile(join(rebuilt, 'index.html'), 'utf8');
        expect(directHtml.match(/Child body\./g)).toHaveLength(2);
        expect(rebuiltHtml.match(/Child body\./g)).toHaveLength(2);
        expect(rebuiltHtml.match(/footnote-backref/g)).toHaveLength(2);
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});

const cases = [
    {
        name: 'sibling labels',
        page: '{% include [a](a.md) %}\n\n{% include [b](b.md) %}',
        files: {'a.md': 'A[^x].\n\n[^x]: Body A.', 'b.md': 'B[^x].\n\n[^x]: Body B.'},
        bodies: ['Body A.', 'Body B.'],
        retainInclude: true,
    },
    {
        name: 'nested repeated',
        page: '{% include [a](a.md) %}\n\n{% include [a](a.md) %}',
        files: {'a.md': '{% include [b](b.md) %}', 'b.md': 'B[^x].\n\n[^x]: Body B.'},
        bodies: ['Body B.', 'Body B.'],
        retainInclude: true,
    },
    {
        name: 'hash notitle',
        page: '{% include notitle [part](a.md#selected) %}',
        files: {'a.md': '## Selected {#selected}\n\nA[^x].\n\n[^x]: Body A.'},
        bodies: ['Body A.'],
        retainInclude: true,
    },
    {
        name: 'root child same label',
        page: 'Root[^x].\n\n{% include [a](a.md) %}\n\n[^x]: Root body.',
        files: {'a.md': 'A[^x].\n\n[^x]: Body A.'},
        bodies: ['Root body.', 'Body A.'],
        retainInclude: true,
    },
    {
        name: 'child unknown reference',
        page: '{% include [a](a.md) %}\n\nRoot[^x].\n\n[^x]: Root body.',
        files: {'a.md': 'Unknown[^x].'},
        bodies: ['Root body.'],
        retainInclude: true,
    },
    {
        name: 'unused definition',
        page: '{% include [a](a.md) %}',
        files: {'a.md': 'Text.\n\n[^unused]: Unused body.'},
        bodies: [],
        retainInclude: true,
    },
    {
        name: 'literal code and escaped marker',
        page: '{% include [a](a.md) %}',
        files: {'a.md': '```\n[^x]: Code literal.\n```\n\n\\[^x]: Escaped literal.'},
        bodies: [],
        retainInclude: false,
    },
];

test.each(cases)(
    'preserves default MD scope for $name',
    async ({page, files, bodies, retainInclude}) => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-footnote-scope-')));
        const input = join(root, 'input');
        const direct = join(root, 'direct');
        const md = join(root, 'md');
        const rebuilt = join(root, 'rebuilt');
        try {
            await mkdir(input);
            await writeFile(
                join(input, 'toc.yaml'),
                'items:\n  - name: Page\n    href: index.md\n',
            );
            await writeFile(join(input, 'index.md'), '# Page\n\n' + page + '\n');
            for (const [name, content] of Object.entries(files))
                await writeFile(join(input, name), content + '\n');
            await build(input, direct);
            await build(input, md, '-f', 'md');
            await build(md, rebuilt);
            const output = await readFile(join(md, 'index.md'), 'utf8');
            const directHtml = await readFile(join(direct, 'index.html'), 'utf8');
            const rebuiltHtml = await readFile(join(rebuilt, 'index.html'), 'utf8');
            expect(output.includes('{% include ')).toBe(retainInclude);
            for (const body of new Set(bodies)) {
                const count = bodies.filter((item) => item === body).length;
                expect(directHtml.split(body).length - 1).toBe(count);
                expect(rebuiltHtml.split(body).length - 1).toBe(count);
            }
            expect((rebuiltHtml.match(/footnote-backref/g) ?? []).length).toBe(
                (directHtml.match(/footnote-backref/g) ?? []).length,
            );
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    },
);
