import type {SearchCorpus} from '~/core/search-index';

import {createServer} from 'node:http';
import {describe, expect, it} from 'vitest';

import {opensearch} from './opensearch';

const corpus: SearchCorpus = {
    schemaVersion: 1,
    documents: [
        {
            id: 'page',
            path: 'en/guide.md',
            url: 'en/guide.html',
            lang: 'en',
            title: 'Guide',
            content: 'Hello',
            headings: ['Guide'],
            keywords: [],
            tags: ['guide'],
        },
    ],
};

async function cluster(
    options: {
        bulkError?: boolean;
        httpError?: boolean;
        invalidRefresh?: boolean;
        empty?: boolean;
        ambiguousSwitch?: boolean;
    } = {},
) {
    const requests: {method: string; path: string; body: string; authorization?: string}[] = [];
    let live = 'docs-old';
    const server = createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        const path = request.url || '';
        requests.push({
            method: request.method || '',
            path,
            body,
            authorization: request.headers.authorization,
        });
        response.setHeader('Content-Type', 'application/json');
        if (request.method === 'GET' && options.empty) {
            response.statusCode = 404;
            return response.end('{}');
        }
        if (request.method === 'GET')
            return response.end(JSON.stringify({[live]: {aliases: {docs: {}}}}));
        if (path.endsWith('/_bulk')) {
            if (options.httpError) response.statusCode = 503;
            return response.end(
                JSON.stringify({
                    errors: options.bulkError === true,
                    items: Array.from({length: body.trim().split('\n').length / 2}, () => ({
                        index: {status: options.bulkError ? 400 : 201},
                    })),
                }),
            );
        }
        if (path.endsWith('/_aliases')) {
            const actions = JSON.parse(body).actions;
            live = actions.find((action: {add?: {index: string}}) => action.add).add.index;
            if (options.ambiguousSwitch) return response.destroy();
        }
        if (path.endsWith('/_refresh'))
            return response.end(
                JSON.stringify(
                    options.invalidRefresh ? {} : {_shards: {failed: 0, successful: 1, total: 1}},
                ),
            );
        return response.end(JSON.stringify({acknowledged: true}));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    return {
        endpoint: `http://127.0.0.1:${address.port}/prefix`,
        requests,
        live: () => live,
        async close() {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
        },
    };
}

describe('OpenSearch indexer', () => {
    it('does not switch the live alias on a malformed refresh response', async () => {
        const remote = await cluster({invalidRefresh: true});
        try {
            await expect(
                opensearch.index(corpus, {endpoint: remote.endpoint, indexName: 'docs'}),
            ).rejects.toThrow();
            expect(remote.live()).toBe('docs-old');
            expect(remote.requests.some((request) => request.path.endsWith('/_aliases'))).toBe(
                false,
            );
        } finally {
            await remote.close();
        }
    });

    it('creates an alias on first upload', async () => {
        const remote = await cluster({empty: true});
        try {
            await opensearch.index(corpus, {endpoint: remote.endpoint, indexName: 'docs'});
            const actions = JSON.parse(remote.requests.at(-1)?.body || '{}').actions;
            expect(actions).toEqual([{add: {index: remote.live(), alias: 'docs'}}]);
        } finally {
            await remote.close();
        }
    });

    it('splits large corpora into bounded batches', async () => {
        const remote = await cluster();
        try {
            const documents = Array.from({length: 501}, (_, index) => ({
                ...corpus.documents[0],
                id: String(index),
            }));
            await opensearch.index(
                {schemaVersion: 1, documents},
                {endpoint: remote.endpoint, indexName: 'docs'},
            );
            const sizes = remote.requests
                .filter((request) => request.path.endsWith('/_bulk'))
                .map((request) => request.body.trim().split('\n').length / 2);
            expect(sizes).toEqual([500, 1]);
        } finally {
            await remote.close();
        }
    });

    it('retains a potentially live index after an ambiguous alias switch', async () => {
        const remote = await cluster({ambiguousSwitch: true});
        try {
            await expect(
                opensearch.index(corpus, {endpoint: remote.endpoint, indexName: 'docs'}),
            ).rejects.toThrow();
            expect(remote.live()).not.toBe('docs-old');
            expect(remote.requests.some((request) => request.method === 'DELETE')).toBe(false);
        } finally {
            await remote.close();
        }
    });

    it('sends NDJSON, refreshes and atomically replaces the alias', async () => {
        const remote = await cluster();
        try {
            await opensearch.index(corpus, {
                endpoint: remote.endpoint,
                indexName: 'docs',
                authorization: 'Bearer private-value',
            });
            expect(remote.live()).not.toBe('docs-old');
            expect(
                remote.requests.map(
                    ({method, path}) => `${method} ${path.replace(/docs-[a-f0-9-]{36}/g, 'NEW')}`,
                ),
            ).toEqual([
                'GET /prefix/_alias/docs',
                'PUT /prefix/NEW',
                'POST /prefix/NEW/_bulk',
                'POST /prefix/NEW/_refresh',
                'POST /prefix/_aliases',
            ]);
            const bulk = remote.requests.find((request) => request.path.endsWith('/_bulk'));
            expect(bulk?.body).toBe(
                `${JSON.stringify({index: {_id: 'page'}})}\n${JSON.stringify(corpus.documents[0])}\n`,
            );
            expect(JSON.parse(remote.requests.at(-1)?.body || '{}').actions[0]).toEqual({
                remove: {index: 'docs-old', alias: 'docs'},
            });
            expect(
                remote.requests.every(
                    (request) => request.authorization === 'Bearer private-value',
                ),
            ).toBe(true);
            expect(remote.requests.some((request) => request.method === 'DELETE')).toBe(false);
        } finally {
            await remote.close();
        }
    });

    it.each([{bulkError: true}, {httpError: true}])(
        'keeps the live alias on upload failure %j',
        async (options) => {
            const remote = await cluster(options);
            try {
                await expect(
                    opensearch.index(corpus, {endpoint: remote.endpoint, indexName: 'docs'}),
                ).rejects.toThrow();
                expect(remote.live()).toBe('docs-old');
                expect(remote.requests.some((request) => request.path.endsWith('/_aliases'))).toBe(
                    false,
                );
                expect(remote.requests.at(-1)?.method).toBe('DELETE');
            } finally {
                await remote.close();
            }
        },
    );

    it('replaces old results with an empty corpus without issuing an empty bulk request', async () => {
        const remote = await cluster();
        try {
            await opensearch.index(
                {schemaVersion: 1, documents: []},
                {endpoint: remote.endpoint, indexName: 'docs'},
            );
            expect(remote.live()).not.toBe('docs-old');
            expect(remote.requests.some((request) => request.path.endsWith('/_bulk'))).toBe(false);
        } finally {
            await remote.close();
        }
    });
});
