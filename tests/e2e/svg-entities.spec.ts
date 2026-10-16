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
        // Match the counted numeric references in draw.io metadata.
        await writeFile(
            join(input, 'branches.svg'),
            `<svg xmlns="http://www.w3.org/2000/svg" content="${'&#10;'.repeat(800)}" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>`,
        );
    });

    afterAll(async () => {
        await rm(temporaryRoot, {recursive: true, force: true});
    });

    test.each([
        ['html', 'flag'],
        ['md', 'flag'],
        ['html', 'config'],
        ['md', 'config'],
    ])('preserves the diagram in %s output with an explicit %s limit', async (format, source) => {
        const output = join(temporaryRoot, `${format}-${source}`);
        const config = join(temporaryRoot, 'entities.yfm');
        await writeFile(config, 'content:\n  svgMaxEntityCount: 1024\n');
        const report = await TestAdapter.build.run(input, output, [
            '-f',
            format,
            '--merge-svg',
            '--no-vcs',
            '--no-search',
            ...(source === 'flag' ? ['--svg-max-entity-count', '1024'] : ['--config', config]),
        ]);

        expect(report.code).toBe(0);
        expect(report.errors).toEqual([]);
        const content = await readFile(join(output, `index.${format}`), 'utf8');
        expect(content).toMatch(/(?:<|&lt;)svg\b/);
        expect(content).toContain('viewBox');
    });
    test.each(['html', 'md'])(
        'preserves the diagram with the parser default in %s',
        async (format) => {
            const output = join(temporaryRoot, `${format}-default`);
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
            // Older supported Transform releases accept this fixture without an entity guard.
            // A guarded parser must preserve the original image and report the fallback.
            if (content.match(/(?:<|&lt;)svg\b/)) {
                expect(content).toContain('viewBox');
                expect(report.warns.join(' ')).not.toContain('SVG entity limit reached');
            } else {
                expect(report.warns.join(' ')).toContain('--svg-max-entity-count');
                if (format === 'html') {
                    expect(content).toMatch(/(?:<|&lt;)img\b/);
                    expect(content).toContain('branches.svg');
                } else {
                    expect(content).toContain('![Branches](branches.svg)');
                    expect(content).not.toContain('<!-- diplodoc:svg');
                }
            }
            expect(await readFile(join(output, 'branches.svg'), 'utf8')).toContain('&#10;');
        },
    );
});
