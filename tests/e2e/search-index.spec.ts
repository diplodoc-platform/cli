import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {TestAdapter} from '../fixtures';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

async function project() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-index-')));
    roots.push(root);
    const input = join(root, 'input');
    const output = join(root, 'output');
    await mkdir(join(input, 'en'), {recursive: true});
    await writeFile(
        join(input, '.yfm'),
        'langs: [en]\nsearch:\n  enabled: false\n  hiddenPolicy: true\n',
    );
    await writeFile(
        join(input, 'en/toc.yaml'),
        'title: Docs\nitems:\n  - name: Guide\n    href: guide.md\n  - name: Private\n    href: private.md\n    noIndex: true\n  - name: Hidden\n    href: hidden.md\n    hidden: true\n',
    );
    await writeFile(
        join(input, 'en/guide.md'),
        '---\ntags: [guide, _internal]\nkeywords: [help]\n---\n# Guide\n\nHello **world** & friends.\n',
    );
    await writeFile(join(input, 'en/private.md'), '# Private\n\nSecret.\n');
    await writeFile(join(input, 'en/hidden.md'), '# Hidden\n\nHidden.\n');
    return {input, output};
}

async function corpus(output: string) {
    return JSON.parse(await readFile(join(output, '_search/documents.json'), 'utf8'));
}

describe('search corpus export', () => {
    it('exports resolved public documents with search disabled', async () => {
        const {input, output} = await project();
        const report = await TestAdapter.build.run(input, output, [
            '--no-lint',
            '--search-index',
            '--skip-html-extension',
            '-j2',
        ]);
        expect(report.code, report.errors.join('\n')).toBe(0);
        const snapshot = await corpus(output);
        expect(snapshot.schemaVersion).toBe(1);
        expect(snapshot.documents).toHaveLength(1);
        expect(snapshot.documents[0]).toEqual({
            id: '1f2fcdd0ccaac9f9a15f4a73a0d9c00fb787bac300f9959aeca48795d5bcc816',
            path: 'en/guide.md',
            url: 'en/guide',
            lang: 'en',
            title: 'Guide',
            content: 'Hello world & friends.',
            tags: ['guide'],
            keywords: ['help'],
            headings: ['Guide'],
        });
    });

    it('keeps document IDs stable when content changes', async () => {
        const {input, output} = await project();
        expect(
            (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'])).code,
        ).toBe(0);
        const before = await corpus(output);
        await writeFile(join(input, 'en/guide.md'), '# Guide\n\nUpdated content.\n');
        expect(
            (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'])).code,
        ).toBe(0);
        const after = await corpus(output);
        expect(after.documents).toHaveLength(1);
        expect(after.documents[0].id).toBe(before.documents[0].id);
        expect(after.documents[0].content).toBe('Updated content.');
    });

    it('replaces the snapshot with an empty array when every page becomes excluded', async () => {
        const {input, output} = await project();
        expect(
            (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'])).code,
        ).toBe(0);
        await writeFile(
            join(input, 'en/guide.md'),
            '---\nnoIndex: true\n---\n# Guide\n\nPrivate now.\n',
        );
        expect(
            (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'])).code,
        ).toBe(0);
        expect(await corpus(output)).toEqual({schemaVersion: 1, documents: []});
    });

    it('removes a stale corpus when a later build does not request export', async () => {
        const {input, output} = await project();
        expect(
            (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'])).code,
        ).toBe(0);
        expect((await TestAdapter.build.run(input, output, ['--no-lint'])).code).toBe(0);
        await expect(readFile(join(output, '_search/documents.json'))).rejects.toThrow();
    });

    it('rejects Markdown output for the HTML corpus exporter', async () => {
        const {input, output} = await project();
        const report = await TestAdapter.build.run(input, output, [
            '--no-lint',
            '--search-index',
            '-f',
            'md',
        ]);
        expect(report.code).toBe(1);
    });

    it('does not export by default', async () => {
        const {input, output} = await project();
        expect((await TestAdapter.build.run(input, output, ['--no-lint'])).code).toBe(0);
        await expect(readFile(join(output, '_search/documents.json'))).rejects.toThrow();
    });
});
