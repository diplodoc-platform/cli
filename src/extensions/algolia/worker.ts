/// <reference no-default-lib="true"/>
/// <reference lib="ES2019" />
/// <reference lib="webworker" />

/* eslint-disable new-cap */
import type {ISearchWorkerApi, ISearchWorkerConfig} from '@diplodoc/client';
import type {IndexRecord} from './provider';

export interface WorkerConfig extends ISearchWorkerConfig {
    appId: string;
    indexName: string;
    searchKey: string;
    querySettings: object;
}

type Snippet<T extends object> = {
    [P in keyof T]: {value: T[P]};
};

type SearchResult = {
    hits: (IndexRecord & {
        _highlightResult: Snippet<IndexRecord>;
        _snippetResult: Snippet<IndexRecord>;
    })[];
};

// Default type of `self` is `WorkerGlobalScope & typeof globalThis`
// https://github.com/microsoft/TypeScript/issues/14877
declare const self: ServiceWorkerGlobalScope & {
    config?: WorkerConfig;
    api?: ISearchWorkerApi;
};

const NOT_INITIALIZED = {
    message: 'Worker is not initialized with required config!',
    code: 'NOT_INITIALIZED',
};

function AssertConfig(config: unknown): asserts config is WorkerConfig {
    if (!config) {
        throw NOT_INITIALIZED;
    }
}

let config: WorkerConfig | null = null;

self.api = {
    async init() {
        config = {
            ...self.config,
        } as WorkerConfig;
    },

    async suggest(query) {
        AssertConfig(config);

        const results = await search(config, query);

        return format(config, results);
    },

    async search(query) {
        AssertConfig(config);

        const result = await search(config, query);

        return format(config, result);
    },
} as ISearchWorkerApi;

async function search(config: WorkerConfig, query: string): Promise<SearchResult> {
    const {appId, searchKey, indexName, querySettings, mark} = config;

    const response = await fetch(`https://${appId}.algolia.net/1/indexes/${indexName}/query`, {
        method: 'POST',
        headers: {
            'x-algolia-application-id': appId,
            'x-algolia-api-key': searchKey,
        },
        body: JSON.stringify({
            ...querySettings,
            query,
            attributesToSnippet: [`text:${TRIM_WORDS}`],
            highlightPreTag: `<span class="${mark}">`,
            highlightPostTag: `</span>`,
            // disableExactOnAttributes: ['text'],
        }),
    });

    return response.json();
}

const TRIM_WORDS = 10;

function format(config: WorkerConfig, result: SearchResult) {
    const {base} = config;

    return result.hits.map(({url, title, _highlightResult, _snippetResult}) => {
        return {
            type: 'page',
            link: `${base.replace(/\/?$/, '')}/${url}`,
            title: _highlightResult?.title?.value || title,
            description: _snippetResult?.text?.value || trim(_highlightResult?.text?.value, 10),
        };
    });
}

function trim(test: string, words: number) {
    const parts = test.split(/\s/);

    if (parts.length > words) {
        return parts.slice(0, words).join(' ') + '...';
    } else {
        return parts.join(' ');
    }
}
