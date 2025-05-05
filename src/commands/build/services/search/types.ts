import type {EntryInfo} from '../../types';

export type SearchAppConfig = Hash;

export interface SearchProvider<TPath extends RelativePath = NormalizedPath> {
    add(path: TPath, lang: string, info: EntryInfo): Promise<void>;

    release(): Promise<void>;

    config(lang: string): SearchAppConfig | undefined;

    // Get the number of objects currently indexed
    getIndexedCount(): number;
}
