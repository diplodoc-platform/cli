import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {LoaderContext} from './loader';
import type {Output} from '@diplodoc/transform';
import type {UrlWithStringQuery} from 'url';

export type CollectPlugin = (this: LoaderContext, content: string) => string;

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
}>;
