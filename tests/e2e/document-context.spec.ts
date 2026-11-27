import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execa} from 'execa';
import {expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

test('a cyclic include exits with failure and a later corrected build succeeds', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-document-cycle-')));
    const input = join(directory, 'input');
    await mkdir(input);

    try {
        await writeFile(join(input, 'toc.yaml'), 'items:\n  - name: Root\n    href: index.md\n');
        await writeFile(join(input, 'index.md'), '# Root\n\n{% include [part](part.md) %}\n');
        await writeFile(join(input, 'part.md'), '{% include [root](index.md) %}\n');
        const binary =
            process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
        const failed = await execa(
            binary,
            [
                '--input',
                input,
                '--output',
                join(directory, 'failed'),
                '-f',
                'html',
                '--no-vcs',
                '--no-search',
            ],
            {reject: false, timeout: 15000},
        );

        expect(failed.timedOut).toBe(false);
        expect(failed.signal).toBeUndefined();
        expect(failed.exitCode).toBe(1);
        expect(failed.stderr).toMatch(/circular|cyclic|cycle/i);
        expect(failed.stderr).toContain('index.md');
        expect(failed.stderr).toContain('part.md');

        await writeFile(join(input, 'part.md'), 'Recovered included content.\n');
        const output = join(directory, 'good');
        const good = await TestAdapter.build.run(input, output, [
            '-f',
            'html',
            '--no-vcs',
            '--no-search',
            '--merge-includes',
        ]);

        expect(good.code).toBe(0);
        expect(good.errors).toEqual([]);
        expect(await readFile(join(output, 'index.html'), 'utf8')).toContain(
            'Recovered included content.',
        );
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('preserves directive examples in code through HTML and Markdown builds', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-code-directives-')));
    const input = join(root, 'input');
    const html = join(root, 'html');
    const markdown = join(root, 'markdown');
    await mkdir(input);
    try {
        await writeFile(join(input, 'toc.yaml'), 'items:\n  - name: Root\n    href: index.md\n');
        await writeFile(
            join(input, 'index.md'),
            '# Root\n\n{% include [part](part.md) %}\n\n`::no-translate[inline literal]`\n\n' +
                '> `code`\n> :no-translate[quote real]\n\n- `code`\n  :no-translate[list real]\n',
        );
        await writeFile(
            join(input, 'part.md'),
            '#|\n||```md\n:::\n:no-translate[code literal]\n```\n||\n|#\n\n:::no-translate\nActual content\n:::\n',
        );
        for (const [output, format] of [
            [html, 'html'],
            [markdown, 'md'],
        ]) {
            const result = await TestAdapter.build.run(input, output, [
                '-f',
                format,
                '--no-vcs',
                '--no-search',
                '--merge-includes',
            ]);
            expect(result.code).toBe(0);
            expect(result.errors).toEqual([]);
        }
        const rendered = await readFile(join(html, 'index.html'), 'utf8');
        const collected = await readFile(join(markdown, 'index.md'), 'utf8');
        expect(rendered).toContain(':::');
        expect(rendered).toContain('no-translate[code literal]');
        expect(rendered).toContain('no-translate[inline literal]');
        expect(rendered).toContain('Actual content');
        expect(collected).toContain(':::\n:no-translate[code literal]');
        expect(collected).toContain('`::no-translate[inline literal]`');
        expect(collected).toContain('Actual content');
        expect(collected).toContain('> `code`\n> quote real');
        expect(collected).toContain('- `code`\n  list real');
        expect(collected).not.toContain(':::no-translate\nActual content');
    } finally {
        await rm(root, {recursive: true, force: true});
    }
});
