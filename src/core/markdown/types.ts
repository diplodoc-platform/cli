import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {UrlWithStringQuery} from 'node:url';
import type {Meta} from '~/core/meta';
import type {LoaderContext} from './loader';

export type Collect = {
    (
        this: LoaderContext,
        content: string,
        // TODO: rewrite old collect to do not use this object
        options: object,
    ):
        | string
        | [string | undefined, Meta | undefined]
        | Promise<string | [string | undefined, Meta | undefined]>;
};

// TODO: We need to specify more precise type in Build.Run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Plugin = MarkdownItPluginCb<any>;

export type Location = [number, number];

export type IncludeInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath | null;
    link: string;
    match: string;
    location: Location;
};

export type ImageOptions = {
    width: string | undefined | null;
    height: string | undefined | null;
    inline: boolean | undefined | null;
};

export type AssetInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    code?: string | null;
    path: NormalizedPath;
    type: 'link' | 'image' | 'video' | 'def';
    subtype?: 'image' | 'reference' | null;
    title: string;
    autotitle: boolean;
    location: Location;
    options?: ImageOptions;
    size?: number;
};

export type HeadingInfo = {
    content: string;
    location: Location;
};

export type EntryGraph = {
    path: NormalizedPath;
    content: string;
    deps: EntryGraphNode[];
    assets: AssetInfo[];
};

export type EntryGraphNode = {
    path: NormalizedPath;
    content: string;
    deps: EntryGraphNode[];
    assets: AssetInfo[];
} & IncludeInfo;

export type EntryInfo = {
    title: string;
    headings: string[];
};

type GraphEntryInfo = {type: 'entry'};

type GraphMissedInfo = {type: 'missed'};

type GraphAssetInfo = {type: 'resource' | 'source'};

export type GraphInfo = GraphEntryInfo | GraphMissedInfo | GraphAssetInfo;
