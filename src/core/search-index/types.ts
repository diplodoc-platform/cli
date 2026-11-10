/** A resolved documentation page, independent of any search backend. */
export type SearchDocument = {
    id: string;
    path: string;
    url: string;
    lang: string;
    title: string;
    content: string;
    headings: string[];
    keywords: string[];
    tags: string[];
};

/** The versioned corpus emitted by `build --search-index`. */
export type SearchCorpus = {schemaVersion: 1; documents: SearchDocument[]};

/** Server-side connection options; never serialized into documentation pages. */
export type SearchIndexOptions = {
    indexName: string;
    endpoint?: string;
    authorization?: string;
    options?: Record<string, unknown>;
};

/** Implement as a named export or default object in a custom provider module. */
export interface SearchIndexer {
    index(corpus: SearchCorpus, options: SearchIndexOptions): Promise<void>;
}
