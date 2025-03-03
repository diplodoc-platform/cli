import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {Output} from '@diplodoc/transform';
import type {UrlWithStringQuery} from 'url';
import type {Meta} from '~/core/meta';
import type {LoaderContext} from './loader';

export type CollectPlugin = (
    this: LoaderContext,
    content: string,
    // TODO: rewrite old collect to do not use this object
    options: object,
) => string | [string | undefined, Meta | undefined];

export type TransformPlugin = MarkdownItPluginCb<any>;

export type Plugin = CollectPlugin | TransformPlugin;

export type Location = {
    start: number;
    end: number;
};

export type IncludeInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
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

export type AdditionalInfo = Readonly<{
    title: string | undefined;
    headings: Output['result']['headings'];
    meta: Meta;
}>;
