import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execa} from 'execa';
import {expect, test} from 'vitest';

test.each([true, false])(
    'actual configured attrs=%s keeps renderer and local-anchor lint aligned',
    async (enabled) => {
        const directory = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-optional-attrs-')));
        const binary =
            process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
        const input = join(directory, 'input');
        const output = join(directory, 'output');
        const source =
            '# Heading {#heading}\n\nParagraph {#paragraph .extra}\n\nHello { name }\n\n[Local](#paragraph)\n';
        try {
            await mkdir(input);
            await writeFile(
                join(input, 'toc.yaml'),
                'items:\n  - name: Heading\n    href: index.md\n',
            );
            await writeFile(join(input, '.yfm'), `enableMarkdownAttrs: ${enabled}\n`);
            await writeFile(join(input, 'index.md'), source);
            const result = await execa(
                binary,
                [
                    '--input',
                    input,
                    '--output',
                    output,
                    '-f',
                    'html',
                    '--no-vcs',
                    '--no-search',
                    '--id-generator',
                    'constant',
                    '-j1',
                ],
                {reject: false, timeout: 30000},
            );
            expect(result.timedOut).toBe(false);
            expect(result.signal).toBeUndefined();
            expect(result.exitCode, result.stderr).toBe(0);
            const page = await readFile(join(output, 'index.html'), 'utf8');
            const payload = page.match(
                /<script type="application\/json" id="diplodoc-state">\s*([\s\S]*?)\s*<\/script>/,
            )?.[1];
            if (payload === undefined) {
                throw new Error('Diplodoc state not found');
            }
            const html = JSON.parse(
                payload.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
            ).data.html;
            expect(html.includes('id="paragraph"')).toBe(enabled);
            expect(html.includes('class="extra"')).toBe(enabled);
            expect(html.includes('Hello { name }')).toBe(!enabled);
            expect((result.stdout + result.stderr).includes('YFM025')).toBe(!enabled);
            expect(await readFile(join(input, 'index.md'), 'utf8')).toBe(source);
        } finally {
            await rm(directory, {recursive: true, force: true});
        }
    },
);
