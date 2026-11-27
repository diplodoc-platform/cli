import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';

import {TestAdapter} from '../fixtures';

const extension = resolve(__dirname, '../mocks/plugin-configuration/extension.cjs');

describe('typed Transform configuration through the actual CLI', () => {
    let directory: string;
    let input: string;

    beforeAll(async () => {
        directory = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-api4-')));
        input = join(directory, 'input');
        await mkdir(input);
        await writeFile(
            join(input, 'toc.yaml'),
            'items:\n  - name: Configured\n    href: index.md\n',
        );
        await writeFile(
            join(input, 'index.md'),
            '# Configured\n\nAPI4_SOURCE API4_BADGE\n\n{% include [part](part.md) %}\n\n![Diagram](diagram.png)\n',
        );
        await writeFile(join(input, 'part.md'), 'Included API4_SOURCE API4_BADGE.\n');
        await writeFile(
            join(input, 'diagram.png'),
            Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1kAAAAASUVORK5CYII=',
                'base64',
            ),
        );
    });

    afterAll(async () => {
        await rm(directory, {recursive: true, force: true});
    });

    async function build(source: string, name: string, format: string) {
        const output = join(directory, name);
        const reportFile = join(directory, name + '.jsonl');
        const report = await TestAdapter.build.run(
            source,
            output,
            ['-f', format, '-e', extension, '--no-vcs', '--no-search', '--merge-includes'],
            {API4_REPORT: reportFile},
        );
        expect(report.code).toBe(0);
        expect(report.errors).toEqual([]);
        const events: {phase: string; path: string; options?: string[]; label?: string}[] = (
            await readFile(reportFile, 'utf8')
        )
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        const collectors = events.filter((event) => event.phase === 'collect');
        expect(collectors.length).toBeGreaterThan(0);
        expect(collectors.every((event) => event.options?.length === 0)).toBe(true);
        expect(collectors.some((event) => event.path === 'index.md')).toBe(true);
        const content = await readFile(join(output, 'index.' + format), 'utf8');
        expect(content).toContain('API4_COLLECTED');
        expect(content).not.toContain('API4_SOURCE');
        expect(content).toContain('Included');
        expect(await readFile(join(output, 'diagram.png'))).toEqual(
            await readFile(join(input, 'diagram.png')),
        );
        if (format === 'html') {
            expect(content).toContain('Configured badge');
            expect(content).not.toContain('API4_BADGE');
            const setups = events.filter((event) => event.phase === 'setup');
            expect(setups.some((event) => event.path === 'index.md')).toBe(true);
            expect(setups.every((event) => event.label === 'Configured badge')).toBe(true);
        } else {
            expect(content).toContain('API4_BADGE');
        }
        return output;
    }

    test('preserves setup context, collector identity, includes and assets in HTML', async () => {
        await build(input, 'direct-html', 'html');
    });

    test('keeps collection independent across MD → MD → HTML', async () => {
        const first = await build(input, 'first-md', 'md');
        const second = await build(first, 'second-md', 'md');
        await build(second, 'roundtrip-html', 'html');
    });
});
