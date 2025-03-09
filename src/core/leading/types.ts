import type {UrlWithStringQuery} from 'node:url';
import type {Meta} from '~/core/meta';
import type {LoaderContext} from './loader';

// TODO: import this type from client?
// import {PageContent} from '@gravity-ui/page-constructor';

type PageContent = {
    blocks: object;
};

export interface RawLeadingPage {
    title: TextItems;
    description?: TextItems;
    meta?: {
        title?: TextItems;
        description?: TextItems;
    } & Meta;
    nav?: {
        title: TextItems;
    };
    links: RawLeadingPageLink[];
}

export type TextItems = string | (TextItem | string)[];

export interface TextItem extends Filter {
    text: string | string[];
}

export interface RawLeadingPageLink extends Filter {
    title?: TextItems;
    description?: TextItems;
    href?: string;
}

export interface Filter {
    when?: boolean | string;
    [key: string]: unknown;
}

export interface LeadingPage extends Partial<PageContent> {
    title: string;
    description?: string | string[];
    meta?: Meta;
    nav?: {
        title: string;
    };
    links?: LeadingPageLink[];
}

export interface LeadingPageLink {
    title?: string;
    description?: string;
    href?: string;
}

export type Plugin = (
    this: LoaderContext,
    leading: LeadingPage,
) => LeadingPage | Promise<LeadingPage>;

export type AssetInfo = Pick<UrlWithStringQuery, 'hash' | 'search'> & {
    path: NormalizedPath;
};
