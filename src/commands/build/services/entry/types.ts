import type {Toc} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {Meta} from '~/core/meta';
import type {VFile} from '~/core/utils';
import type {EntryInfo} from '../../';

export type EntryData = (
    | {
          type: 'md';
          content: VFile<string>;
      }
    | {
          type: 'yaml';
          content: VFile<LeadingPage>;
      }
) & {
    path: NormalizedPath;
    meta: Meta;
    info: EntryInfo;
};

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
