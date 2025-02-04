import Record from '@diplodoc/client/manifest';

export type ThemeVariant = 'light' | 'dark';

export type ThemeConfig = {
    [K in keyof ColorsOptions]?: string;
} & {
    light?: ColorsOptions;
    dark?: ColorsOptions;
};

export type ColorsOptions = GravityColorsOptions & YFMColorOptions;

export const YFM_COLOR_KEYS = [
    'note-info-background',
    'note-tip-background',
    'note-warning-background',
    'note-important-background',
] as const;

export type YFMColorOptions = {
    [K in (typeof YFM_COLOR_KEYS)[number]]?: string;
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
    'text-misc'?: string;
};

export const BRAND_COLOR_KEYS = [
    'base-brand',
    'base-background',
    'base-brand-hover',
    'base-selection',
    'base-selection-hover',
    'text-link',
    'text-link-hover',
    'text-brand',
    'text-brand-heavy',
    'line-brand',
] as const;

export type BrandDependColorOptions = {
    [K in (typeof BRAND_COLOR_KEYS)[number]]?: string;
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
