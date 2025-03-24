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
    'restricted-access'?: string;
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
    'restricted-access'?: string;
} & (RawNamedTocItem | RawIncludeTocItem);

type RawNamedTocItem = {
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
    from: RelativePath;
    mode: IncludeMode;
    content?: RawToc;
    base?: RelativePath | undefined;
};

export type Toc = {
    id: string;
    title?: string;
    label?: string;
    stage?: string;
    href?: NormalizedPath;
    navigation?: boolean | Navigation;
    items?: TocItem[];
    'restricted-access'?: string;
};

export type TocItem = NamedTocItem & {hidden?: boolean} & {
    id: string;
    items?: TocItem[];
    'restricted-access'?: string;
};

export type NamedTocItem = {
    name: string;
    href?: NormalizedPath;
};
