import type {Toc} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {Meta} from '~/core/meta';
import type {EntryInfo} from '../../';

export type EntryData = (
    | {
          type: 'md';
          content: string;
      }
    | {
          type: 'yaml';
          content: LeadingPage;
      }
) & {
    path: NormalizedPath;
    meta: Meta;
    info: EntryInfo;
};

export type EntryResult = [NormalizedPath, string | LeadingPage, object];

export type PageData = (
    | {
          leading: true;
          data: LeadingPage;
          html?: never;
          headings?: never;
      }
    | {
          leading: false;
          html: string;
          data?: never;
          headings: any;
      }
) & {
    toc?: Toc;
    meta: Meta;
    title: string;
};

export type PageState = {
    data: PageData & Hash;
    router: {
        pathname: NormalizedPath;
        depth: number;
        base: string;
    };
    search?: {
        enabled: boolean;
    } & Hash;
    lang: string;
    langs: string[];
    analytics: Hash;
} & Hash;
