import type {SearchCorpus, SearchIndexOptions, SearchIndexer} from '~/core/search-index';

import {randomUUID} from 'node:crypto';

import {validateCorpus} from '~/core/search-index';

const MAX_BATCH_BYTES = 5 * 1024 * 1024;
const MAX_BATCH_DOCUMENTS = 500;

function validateRefresh(result: unknown) {
    const shards = (
        result as {_shards?: {failed: number; total: number; successful: number}} | null
    )?._shards;
    if (
        !shards ||
        shards.failed !== 0 ||
        !Number.isInteger(shards.total) ||
        shards.total <= 0 ||
        !Number.isInteger(shards.successful) ||
        shards.successful <= 0 ||
        shards.successful > shards.total
    ) {
        throw new Error('OpenSearch refresh failed or returned an invalid response.');
    }
}

function connection({endpoint, indexName}: SearchIndexOptions) {
    if (!endpoint) throw new Error('OpenSearch requires --endpoint or SEARCH_INDEX_ENDPOINT.');
    const url = new URL(endpoint);
    if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            'OpenSearch endpoint must be an HTTP(S) URL without credentials, query or fragment.',
        );
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(indexName) || indexName.length > 200) {
        throw new Error(
            'OpenSearch index name must be a lowercase alias of at most 200 characters.',
        );
    }
    return url.href.replace(/\/$/, '');
}

/** Upload complete snapshots and switch the live alias only after successful indexing. */
export const opensearch: SearchIndexer = {
    async index(corpus: SearchCorpus, options: SearchIndexOptions) {
        validateCorpus(corpus);
        const base = connection(options);
        for (const document of corpus.documents) {
            if (Buffer.byteLength(document.id) > 512)
                throw new Error('OpenSearch document ID exceeds 512 bytes.');
        }
        const alias = options.indexName;
        const staging = `${alias}-${randomUUID()}`;
        const request = async (path: string, method: string, body?: string, missing = false) => {
            const response = await fetch(`${base}/${path}`, {
                method,
                body,
                redirect: 'error',
                signal: AbortSignal.timeout(30000),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': path.endsWith('/_bulk')
                        ? 'application/x-ndjson'
                        : 'application/json',
                    ...(options.authorization ? {Authorization: options.authorization} : {}),
                },
            });
            if (missing && response.status === 404) {
                await response.body?.cancel();
                return {};
            }
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error(`OpenSearch ${method} request failed: HTTP ${response.status}.`);
            }
            return response.json();
        };
        const current: unknown = await request(
            `_alias/${encodeURIComponent(alias)}`,
            'GET',
            undefined,
            true,
        );
        if (!current || typeof current !== 'object' || Array.isArray(current))
            throw new Error('Invalid OpenSearch alias response.');
        const previous = Object.keys(current);
        let created = false;
        let switching = false;
        try {
            const settings = await request(
                staging,
                'PUT',
                JSON.stringify({
                    mappings: {
                        properties: {
                            id: {type: 'keyword'},
                            path: {type: 'keyword'},
                            url: {type: 'keyword'},
                            lang: {type: 'keyword'},
                            title: {type: 'text'},
                            content: {type: 'text'},
                            headings: {type: 'text'},
                            keywords: {type: 'keyword'},
                            tags: {type: 'keyword'},
                        },
                    },
                }),
            );
            if (settings.acknowledged !== true)
                throw new Error('OpenSearch did not acknowledge index creation.');
            created = true;
            let batch: string[] = [];
            let bytes = 0;
            const flush = async () => {
                if (!batch.length) return;
                const result = await request(`${staging}/_bulk`, 'POST', batch.join(''));
                if (
                    result.errors !== false ||
                    !Array.isArray(result.items) ||
                    result.items.length !== batch.length ||
                    result.items.some(
                        (item: {index?: {status?: number; error?: unknown}}) =>
                            !item?.index ||
                            typeof item.index.status !== 'number' ||
                            item.index.status < 200 ||
                            item.index.status >= 300 ||
                            item.index.error,
                    )
                ) {
                    throw new Error(
                        'OpenSearch bulk indexing failed or returned an invalid response.',
                    );
                }
                batch = [];
                bytes = 0;
            };
            for (const document of corpus.documents) {
                const record = `${JSON.stringify({index: {_id: document.id}})}\n${JSON.stringify(document)}\n`;
                const size = Buffer.byteLength(record);
                if (
                    batch.length &&
                    (batch.length >= MAX_BATCH_DOCUMENTS || bytes + size > MAX_BATCH_BYTES)
                )
                    await flush();
                batch.push(record);
                bytes += size;
            }
            await flush();
            const refreshed = await request(`${staging}/_refresh`, 'POST');
            validateRefresh(refreshed);
            const actions = [
                ...previous.map((index) => ({remove: {index, alias}})),
                {add: {index: staging, alias}},
            ];
            // An ambiguous network failure here may follow a successful alias switch.
            // Keep staging in that case rather than deleting a potentially live index.
            switching = true;
            const switched = await request('_aliases', 'POST', JSON.stringify({actions}));
            if (switched.acknowledged !== true)
                throw new Error('OpenSearch did not acknowledge the alias switch.');
        } catch (error) {
            if (created && !switching) await request(staging, 'DELETE').catch(() => undefined);
            throw error;
        }
    },
};
