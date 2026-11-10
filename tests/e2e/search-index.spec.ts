import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
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
    return {root, input, output};
}

describe('search corpus export', () => {
    it('uploads to OpenSearch using connection and private authorization environment variables', async () => {
        const {input, output} = await project();
        const requests: {path: string; authorization?: string}[] = [];
        const server = createServer(async (request, response) => {
            const path = request.url || '';
            requests.push({path, authorization: request.headers.authorization});
            let body = '';
            for await (const chunk of request) body += chunk;
            response.setHeader('Content-Type', 'application/json');
            if (request.method === 'GET') {
                response.statusCode = 404;
                response.end('{}');
            } else if (path.endsWith('/_bulk'))
                response.end(
                    JSON.stringify({
                        errors: false,
                        items: Array.from({length: body.trim().split('\n').length / 2}, () => ({
                            index: {status: 201},
                        })),
                    }),
                );
            else if (path.endsWith('/_refresh'))
                response.end(JSON.stringify({_shards: {failed: 0, successful: 1, total: 1}}));
            else response.end(JSON.stringify({acknowledged: true}));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('Missing address');
            const env = {
                SEARCH_INDEX_ENDPOINT: `http://127.0.0.1:${address.port}`,
                SEARCH_INDEX_NAME: 'docs',
                SEARCH_INDEX_AUTHORIZATION: 'Bearer test-secret',
            };
            expect(
                (await TestAdapter.build.run(input, output, ['--no-lint', '--search-index'], env))
                    .code,
            ).toBe(0);
            expect(requests).toHaveLength(0);
            expect(await readFile(join(output, '_search/documents.json'), 'utf8')).not.toContain(
                'test-secret',
            );
            const upload = await TestAdapter.runner.runYfmDocs(['search-index', '-i', output], env);
            expect(upload.code, upload.errors.join('\n')).toBe(0);
            expect(requests[0].path).toBe('/_alias/docs');
            expect(requests.at(-1)?.path).toBe('/_aliases');
            expect(
                requests.every((request) => request.authorization === 'Bearer test-secret'),
            ).toBe(true);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        }
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
    it('exports resolved public documents with search disabled and uploads through a custom module', async () => {
        const {root, input, output} = await project();
        const report = await TestAdapter.build.run(input, output, [
            '--no-lint',
            '--search-index',
            '--skip-html-extension',
            '-j2',
        ]);
        expect(report.code, report.errors.join('\n')).toBe(0);
        const corpus = JSON.parse(await readFile(join(output, '_search/documents.json'), 'utf8'));
        expect(corpus.schemaVersion).toBe(1);
        expect(corpus.documents).toHaveLength(1);
        expect(corpus.documents[0]).toMatchObject({
            path: 'en/guide.md',
            url: 'en/guide',
            lang: 'en',
            title: 'Guide',
            content: expect.stringContaining('Hello world & friends.'),
            tags: ['guide'],
            keywords: ['help'],
            headings: ['Guide'],
        });
        expect(corpus.documents[0].content).not.toContain('<');
        const received = join(root, 'received.json');
        const provider = join(root, 'provider.cjs');
        await writeFile(
            provider,
            `const fs = require('node:fs/promises');\nmodule.exports = {async index(corpus, options) { await fs.writeFile(${JSON.stringify(received)}, JSON.stringify({corpus, name: options.indexName})); }};`,
        );
        const upload = await TestAdapter.runner.runYfmDocs([
            'search-index',
            '-i',
            output,
            '--provider',
            provider,
            '--index-name',
            'docs',
        ]);
        expect(upload.code, upload.errors.join('\n')).toBe(0);
        expect(JSON.parse(await readFile(received, 'utf8'))).toEqual({corpus, name: 'docs'});
    });

    it('does not export by default', async () => {
        const {input, output} = await project();
        expect((await TestAdapter.build.run(input, output, ['--no-lint'])).code).toBe(0);
        await expect(readFile(join(output, '_search/documents.json'))).rejects.toThrow();
    });
});
