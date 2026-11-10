import type {SearchCorpus} from './types';

export type * from './types';

export const SEARCH_CORPUS_PATH = '_search/documents.json';

/** Validate an exported corpus before an indexer can make remote changes. */
export function validateCorpus(value: unknown): asserts value is SearchCorpus {
    const corpus = value as SearchCorpus | null;
    if (!corpus || corpus.schemaVersion !== 1 || !Array.isArray(corpus.documents)) {
        throw new Error('Expected a search corpus with schemaVersion: 1 and documents array.');
    }
    const ids = new Set<string>();
    for (const document of corpus.documents) {
        if (
            !document ||
            ['id', 'path', 'url', 'lang', 'title', 'content'].some(
                (key) => typeof document[key as keyof typeof document] !== 'string',
            ) ||
            !document.id ||
            !document.path ||
            !document.url ||
            !document.lang ||
            ['headings', 'keywords', 'tags'].some((key) => {
                const values = document[key as 'headings' | 'keywords' | 'tags'];
                return !Array.isArray(values) || values.some((item) => typeof item !== 'string');
            })
        ) {
            throw new Error('Invalid document in search corpus.');
        }
        if (ids.has(document.id)) throw new Error('Duplicate document ID in search corpus.');
        ids.add(document.id);
    }
}
