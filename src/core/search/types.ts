import type {DocPageData} from '@diplodoc/client/ssr';

export type SearchAppConfig = Hash;

export interface SearchProvider<TPath extends RelativePath = NormalizedPath> {
    add(path: TPath, lang: string, info: DocPageData): Promise<void>;

    release(): Promise<void>;

    config(lang: string): SearchAppConfig;
}
