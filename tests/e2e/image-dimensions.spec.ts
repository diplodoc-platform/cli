import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execa} from 'execa';
import {migrateImageDimensions} from '@diplodoc/transform/migrations/image-dimensions';
import {expect, test} from 'vitest';

test('legacy and migrated image dimensions survive HTML, Markdown, includes and lint', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-image-dimensions-')));
    const binary = process.env.DIPLODOC_BINARY_PATH || resolve(__dirname, '../../build/index.js');
    const source =
        '# Images\n\n![**Alternative**](image.png?query=keep "Tooltip" =20x30)\n\n![Percent](image.png =50%x100%)\n\n{% include [part](part.md) %}\n';
    const child = '![Child](image.png "Included tooltip" =x40)\n';
    const imageAttrs = (html: string) => {
        const source = html.match(
            /<script type="application\/json" id="diplodoc-state">\s*([\s\S]*?)\s*<\/script>/,
        )?.[1];
        if (source === undefined) {
            throw new Error('Diplodoc state not found');
        }
        const state = JSON.parse(
            source.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        );
        return [...state.data.html.matchAll(/<img\b[^>]*>/g)].map((image) => {
            const attributes = Object.fromEntries(
                [...image[0].matchAll(/\s([\w-]+)="([^"]*)"/g)].map((attribute) => [
                    attribute[1],
                    attribute[2],
                ]),
            );
            return Object.fromEntries(
                ['src', 'alt', 'title', 'width', 'height', 'style'].map((key) => [
                    key,
                    attributes[key],
                ]),
            );
        });
    };
    const render = async (input: string, output: string, format: 'md' | 'html') => {
        const result = await execa(
            binary,
            [
                '--input',
                input,
                '--output',
                output,
                '-f',
                format,
                '--no-vcs',
                '--no-search',
                '--merge-includes',
                '--id-generator',
                'constant',
                '-j1',
            ],
            {reject: false, timeout: 30000},
        );
        expect(result.timedOut).toBe(false);
        expect(result.signal).toBeUndefined();
        expect(result.exitCode, result.stderr).toBe(0);
        return result.stdout + result.stderr;
    };

    try {
        let expected: ReturnType<typeof imageAttrs> | undefined;
        for (const migrated of [false, true]) {
            const input = join(directory, migrated ? 'modern' : 'legacy');
            await mkdir(input);
            const root = migrated ? migrateImageDimensions(source).output : source;
            const part = migrated ? migrateImageDimensions(child).output : child;
            await writeFile(
                join(input, 'toc.yaml'),
                'items:\n  - name: Images\n    href: index.md\n',
            );
            await writeFile(join(input, 'index.md'), root);
            await writeFile(join(input, 'part.md'), part);
            await writeFile(
                join(input, 'image.png'),
                Buffer.from(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
                    'base64',
                ),
            );
            const html = join(directory, migrated ? 'modern-html' : 'legacy-html');
            const terminal = await render(input, html, 'html');
            expect(terminal.includes('IMAGE_SIZE_LEGACY_SYNTAX')).toBe(!migrated);
            if (!migrated) {
                expect(terminal).toContain('index.md');
                expect(terminal).toContain('6.0.0');
            }
            const direct = imageAttrs(await readFile(join(html, 'index.html'), 'utf8'));
            expect(direct).toHaveLength(3);
            expect(direct[0]).toMatchObject({
                src: 'image.png?query=keep',
                title: 'Tooltip',
                width: '20',
                height: '30',
            });
            expect(direct[1]).toMatchObject({width: '50%', height: '100%'});
            expect(direct[2]).toMatchObject({height: '40', title: 'Included tooltip'});
            if (expected) expect(direct).toEqual(expected);
            else expected = direct;

            const markdown = join(directory, migrated ? 'modern-md' : 'legacy-md');
            await render(input, markdown, 'md');
            const collected = await readFile(join(markdown, 'index.md'), 'utf8');
            expect(collected).toContain('Included tooltip');
            expect(collected).not.toContain('{% include');
            expect(collected.includes('=20x30')).toBe(!migrated);
            expect(collected.includes('{width=20 height=30}')).toBe(migrated);
            const rebuilt = join(directory, migrated ? 'modern-rebuilt' : 'legacy-rebuilt');
            await render(markdown, rebuilt, 'html');
            expect(imageAttrs(await readFile(join(rebuilt, 'index.html'), 'utf8'))).toEqual(direct);
            expect(await readFile(join(input, 'index.md'), 'utf8')).toBe(root);
            expect(await readFile(join(input, 'part.md'), 'utf8')).toBe(part);
        }
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});
