import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

describe('SVG metadata with many counted XML entities', () => {
    let temporaryRoot: string;
    let input: string;

    beforeAll(async () => {
        temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-svg-entities-')));
        input = join(temporaryRoot, 'input');
        await mkdir(input);
        await writeFile(join(input, 'toc.yaml'), 'items:\n  - name: Diagram\n    href: index.md\n');
        await writeFile(
            join(input, 'index.md'),
            '# Diagram\n\n![Branches](branches.svg){inline=true}\n',
        );
        // Match the counted numeric references in draw.io metadata (DOCSTOOLS-6096).
        await writeFile(
            join(input, 'branches.svg'),
            `<svg xmlns="http://www.w3.org/2000/svg" content="${'&#10;'.repeat(800)}" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>`,
        );
    });

    afterAll(async () => {
        await rm(temporaryRoot, {recursive: true, force: true});
    });

    test.each(['html', 'md'])('preserves the diagram in %s output', async (format) => {
        const output = join(temporaryRoot, format);
        const report = await TestAdapter.build.run(input, output, [
            '-f',
            format,
            '--merge-svg',
            '--no-vcs',
            '--no-search',
        ]);

        expect(report.code).toBe(0);
        expect(report.errors).toEqual([]);
        const content = await readFile(join(output, `index.${format}`), 'utf8');
        expect(content).toMatch(/(?:<|&lt;)svg\b/);
        expect(content).toContain('viewBox');
    });
});
