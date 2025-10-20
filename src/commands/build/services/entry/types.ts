import type {Heading} from '@diplodoc/transform/lib/typings';
import type {Toc} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {Meta} from '~/core/meta';
import type {VFile} from '~/core/utils';
import type {EntryInfo} from '../../';

export type EntryData = (
    | {
          type: 'md';
          content: VFile<string>;
          info: EntryInfo<MarkdownData>;
      }
    | {
          type: 'yaml';
          content: VFile<LeadingPage>;
          info: EntryInfo<LeadingData>;
      }
) & {
    path: NormalizedPath;
    meta: Meta;
};

export type LeadingData = {
    leading: true;
    data: LeadingPage;
    html?: never;
    headings?: never;
};

export type MarkdownData = {
    leading: false;
    html: string;
    data?: never;
    headings: Heading[];
};

export type PageData<Extras extends LeadingData | MarkdownData = LeadingData | MarkdownData> =
    Extras & {
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
    neuroExpert?: NeuroExpert;
} & Hash;

type BaseNeuroExpert = {
    hasOutsideClick?: boolean;
    isInternal?: boolean;
    parentId?: string | null;
    zIndex?: number;
};

export type NeuroExpertSettings = BaseNeuroExpert & {
    projectId: string;
};

export type NeuroExpert = BaseNeuroExpert & {
    projectId?: {
        [key: string]: string;
    };
    isDisabled?: boolean;
};
