import Record from '@diplodoc/client/manifest';

export type ThemeVariant = 'light' | 'dark';

export type ThemeConfig = {
    [_K in keyof ColorsOptions]?: string;
} & {
    light?: ColorsOptions;
    dark?: ColorsOptions;
};

export type ColorsOptions = GravityColorsOptions & YFMColorOptions & DCColorOptions;

export const YFM_COLOR_KEYS = [
    'note-info',
    'note-tip',
    'note-warning',
    'note-important',
    'note-info-background',
    'note-tip-background',
    'note-warning-background',
    'note-important-background',
    'note-info-border',
    'note-tip-border',
    'note-warning-border',
    'note-important-border',
    'quote',
    'tab',
    'tab-hover',
    'table',
    'table-background',
    'table-row-background',
    'table-outer-border',
    'table-inner-border',
    'code',
    'code-background',
    'inline-code',
    'inline-code-background',
] as const;

export const YFM_BORDER_KEYS = [
    'note-info-border',
    'note-tip-border',
    'note-warning-border',
    'note-important-border',
];

export type YFMColorOptions = {
    [_K in (typeof YFM_COLOR_KEYS)[number]]?: string;
};

export type GravityColorsOptions = BrandDependColorOptions & {
    'base-misc-light'?: string;
    'line-generic'?: string;
    'base-generic'?: string;
    'base-generic-hover'?: string;
    'text-primary'?: string;
    'text-secondary'?: string;
    'text-complementary'?: string;
    'text-hint'?: string;
};

export const BRAND_COLOR_KEYS = [
    'base-brand',
    'base-background',
    'base-selection',
    'text-link',
    'text-link-hover',
] as const;

export type BrandDependColorOptions = {
    [_K in (typeof BRAND_COLOR_KEYS)[number]]?: string;
};

export const DC_COLOR_KEYS = [
    'mini-toc-border',
    'mini-toc',
    'mini-toc-hover',
    'mini-toc-active',
    'mini-toc-active-border',
] as const;

export type DCColorOptions = {
    [_K in (typeof DC_COLOR_KEYS)[number]]?: string;
};

export type Theme = {
    base?: ThemeOptions;
    light?: ThemeOptions;
    dark?: ThemeOptions;
};

export interface ThemeOptions {
    palette?: Record<string, string>;
    colors: ColorsOptions;
}
