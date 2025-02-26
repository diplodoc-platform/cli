import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import type {LoaderContext} from './loader';
import type {Output} from '@diplodoc/transform';

export type CollectPlugin = (this: LoaderContext, content: string) => string;

export type TransformPlugin = MarkdownItPluginCb<any>;

export type Plugin = CollectPlugin | TransformPlugin;

export type Location = {
    start: number;
    end: number;
};

export type IncludeInfo = Readonly<[NormalizedPath, Location]>;

export type HeadingInfo = Readonly<[string, Location]>;

export type AdditionalInfo = Readonly<{
    title: string | undefined;
    headings: Output['result']['headings'];
}>;
