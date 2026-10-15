import type {EntryInfo} from '../../types';

export type SearchAppConfig = Hash;

export interface SearchProvider<TPath extends RelativePath = NormalizedPath> {
    add(path: TPath, lang: string, info: EntryInfo): Promise<void>;

    release(): Promise<void>;

    config(lang: string): SearchAppConfig | undefined;

    /**
     * Returns a script path relative to the published documentation root,
     * e.g. `_search/en/resources.js`, without a leading slash.
     * SearchService adds it automatically to search pages in the state position,
     * before the client scripts; do not add it again in the search Page hook.
     */
    resourcesLink?(lang: string): string;
}
