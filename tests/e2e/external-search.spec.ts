import {access, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {runInNewContext} from 'node:vm';
import {afterEach, describe, expect, it} from 'vitest';

import {TestAdapter} from '../fixtures';

const roots: string[] = [];
afterEach(async () =>
    Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true}))),
);

async function project(config: string) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'diplodoc-external-search-')));
    roots.push(root);
    const input = join(root, 'input');
    const output = join(root, 'output');
    await mkdir(join(input, 'en'), {recursive: true});
    await writeFile(join(input, '.yfm'), `langs: [en]\n${config}\n`);
    await writeFile(
        join(input, 'en/toc.yaml'),
        'title: Docs\nitems:\n  - name: Guide\n    href: guide.md\n',
    );
    await writeFile(
        join(input, 'en/guide.md'),
        '---\ntags: [guide, _technical]\n---\n# Guide\n\nA guide.\n',
    );
    return {input, output};
}

function state(html: string) {
    const encoded = /id="diplodoc-state"[^>]*>(.*?)<\/script>/s.exec(html)?.[1] || '';
    return JSON.parse(
        encoded
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&'),
    );
}

describe('external HTTP search', () => {
    it('builds article/suggest and result-page config and runs the shipped API against HTTP', async () => {
        const requests: URL[] = [];
        const server = createServer((request, response) => {
            requests.push(new URL(request.url || '/', 'http://localhost'));
            response.setHeader('Content-Type', 'application/json');
            response.end(
                JSON.stringify({
                    items: [
                        {title: 'Guide', url: '/product/v1/en/guide.html', description: 'A guide'},
                    ],
                    total: 12,
                }),
            );
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('No server address');
            const endpoint = `http://127.0.0.1:${address.port}/query`;
            const {input, output} = await project(
                `search:\n  provider: external\n  endpoint: ${endpoint}\n  options:\n    version: v1`,
            );
            const report = await TestAdapter.build.run(input, output, [
                '-f',
                'html',
                '--no-lint',
                '-j2',
            ]);
            expect(report.code, report.errors.join('\n')).toBe(0);
            expect(requests).toHaveLength(0);
            const article = state(await readFile(join(output, 'en/guide.html'), 'utf8'));
            const page = state(await readFile(join(output, '_search/en/index.html'), 'utf8'));
            expect(article.search).toMatchObject({
                provider: 'external',
                endpoint,
                api: '_search/external-api.js',
                link: '_search/en/index.html',
            });
            expect(page).toMatchObject({
                provider: 'external',
                endpoint,
                lang: 'en',
                options: {version: 'v1'},
                tags: ['guide'],
            });
            const context = {
                config: {...page, base: 'https://docs.example.test/product/v1'},
                fetch,
                URL,
            };
            const source = await readFile(join(output, '_search/external-api.js'), 'utf8');
            runInNewContext(source, context);
            const {api} = context as typeof context & {
                api: {
                    search: (
                        query: string,
                        count: number,
                        page: number,
                        tags: string[],
                    ) => Promise<unknown>;
                    suggest: (query: string, count: number) => Promise<unknown>;
                };
            };
            await expect(api.search('a & б', 5, 2, ['api ref', 'guide'])).resolves.toMatchObject({
                total: 12,
            });
            await expect(api.suggest('guide', 3)).resolves.toMatchObject([
                {type: 'page', link: '/product/v1/en/guide.html'},
            ]);
            expect(Object.fromEntries(requests[0].searchParams)).toMatchObject({
                query: 'a & б',
                count: '5',
                page: '2',
                lang: 'en',
                version: 'v1',
            });
            expect(requests[0].searchParams.getAll('tags')).toEqual(['api ref', 'guide']);
            expect(requests[1].searchParams.get('page')).toBe('1');
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        }
    });

    it('supports flags, pretty links, and disabling external search', async () => {
        const {input, output} = await project('');
        const flags = [
            '-f',
            'html',
            '--no-lint',
            '--search-provider',
            'external',
            '--search-endpoint',
            '/query',
            '--search-options',
            '{"version":"v2"}',
            '--skip-html-extension',
        ];
        expect((await TestAdapter.build.run(input, output, flags)).code).toBe(0);
        const article = state(await readFile(join(output, 'en/guide.html'), 'utf8'));
        expect(article.search).toMatchObject({
            endpoint: '/query',
            options: {version: 'v2'},
            link: '_search/en/',
        });
        const disabledOutput = join(output, '../disabled');
        expect(
            (await TestAdapter.build.run(input, disabledOutput, [...flags, '--no-search'])).code,
        ).toBe(0);
        await expect(access(join(disabledOutput, '_search/en/index.html'))).rejects.toThrow();
    });
});
