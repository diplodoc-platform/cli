type YfmString = string & {
    __interpolable: true;
};

export type Filter = {
    when?: string | boolean;
};

export type TextFilter = {
    text: string;
} & Filter;

export type WithItems = {
    items: RawTocItem[];
};

export type RawToc = {
    title?: YfmString | TextFilter[];
    label?: YfmString | TextFilter[];
    stage?: string;
    navigation?: boolean | YfmString | Navigation;
} & Partial<WithItems>;

export type RawTocItem = Filter &
    Partial<WithItems> & {hidden?: boolean} & (RawNamedTocItem | RawIncludeTocItem);

type RawNamedTocItem = {
    name: YfmString;
    href: YfmString & (RelativePath | URIString);
};

type RawIncludeTocItem = {
    name?: YfmString;
    include: TocInclude;
};

type TocInclude = {
    mode?: TocIncludeMode;
    path: RelativePath;
    includers?: Includer[];
};

export enum TocIncludeMode {
    RootMerge = 'root_merge',
    Merge = 'merge',
    Link = 'link',
}
