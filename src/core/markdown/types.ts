import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {UrlWithStringQuery} from 'node:url';
import type {Meta} from '~/core/meta';
import type {CollectStage, LoaderContext} from './loader';

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
    stage?: `${CollectStage}`;
};

export type Plugin = MarkdownItPluginCb<any>;

export type Location = [number, number];

export type IncludeInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
    signpath: NormalizedPath;
    link: string;
    signlink: string;
    location: Location;
};

export type AssetInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
    location: Location;
};

export type HeadingInfo = {
    content: string;
    location: Location;
};
