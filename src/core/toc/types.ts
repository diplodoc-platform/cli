import type {IncludeMode} from './loader';

// TODO: move to global types
export type YfmString = string & {
    __interpolable: true;
};

export type Filter = {
    when?: string | boolean;
};

export type TextFilter = {
    text: string;
} & Filter;

export type WithItems<Item> = {
    items?: Item[];
};

export type RawToc = {
    title?: YfmString | TextFilter[];
    label?: YfmString | TextFilter[];
    stage?: string;
    href?: YfmString & (RelativePath | URIString);
    navigation?: boolean | YfmString | Navigation;
    items?: RawTocItem[];
};

// TODO: add precise types
export type Navigation = {
    logo: object;
    header: {
        leftItems?: object;
        rightItems?: object;
    };
};

export type RawTocItem = Filter & {
    hidden?: boolean;
    items?: RawTocItem[];
} & (RawEntryTocItem | RawNamedTocItem | RawIncludeTocItem);

export type RawEntryTocItem = {
    name?: YfmString;
    href: YfmString & (RelativePath | URIString);
};

export type RawNamedTocItem = {
    name: YfmString;
    href?: YfmString & (RelativePath | URIString);
};

type RawIncludeTocItem = {
    name?: YfmString;
    include: TocInclude;
};

export type TocInclude = {
    mode?: IncludeMode;
    path: RelativePath;
    includers?: Includer[];
};

export type Includer<T extends Hash = Hash> = {
    name: string;
} & T;

export type IncluderOptions<T extends Hash = Hash> = {
    /**
     * Relative to run.input include path
     */
    path: RelativePath;
} & T;

export type IncludeInfo = {
    from: NormalizedPath;
    mode: IncludeMode;
    content?: RawToc;
    base?: NormalizedPath | undefined;
};

export type Toc = {
    path: NormalizedPath;
    id: string;
    title?: string;
    label?: {
        title: string;
        description?: string;
        theme?: any;
    };
    stage?: string;
    href?: NormalizedPath;
    navigation?: boolean | Navigation;
    items?: TocItem[];
};

export type TocItem = (NamedTocItem | EntryTocItem) & {hidden?: boolean} & {
    id: string;
    items?: TocItem[];
};

export type EntryTocItem = {
    name: string;
    href: NormalizedPath;
};

export type NamedTocItem = {
    name: string;
    href?: NormalizedPath;
};
