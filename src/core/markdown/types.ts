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

export type Plugin = MarkdownItPluginCb<any>;

export type Location = [number, number];

export type IncludeInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
    link: string;
    match: string;
    location: Location;
};

export type AssetInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
    type: 'link' | 'image' | 'video' | 'def';
    title: string;
    autotitle: boolean;
    location: Location;
};

export type HeadingInfo = {
    content: string;
    location: Location;
};

export type EntryGraph = {
    path: NormalizedPath;
    content: string;
    deps: EntryGraphNode[];
};

export type EntryGraphNode = {
    path: NormalizedPath;
    content: string;
    deps: EntryGraphNode[];
} & IncludeInfo;
