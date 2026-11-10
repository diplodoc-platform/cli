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
