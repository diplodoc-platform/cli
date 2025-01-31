import Record from '@diplodoc/client/manifest';

export type ThemeVariant = 'light' | 'dark';

export interface ThemeConfig extends Record<ThemeVariant, ColorsOptions> {}

export interface ColorsOptions extends GravityColorsOptions, YFMColorOptions {}

export const YFM_COLOR_KEYS = [
    'note-info-background',
    'note-tip-background',
    'note-warning-background',
    'note-important-background',
    'hljs-addition', // нужно ли давать менять hljs переменные?
];

export type YFMColorOptions = {
    [K in (typeof YFM_COLOR_KEYS)[number]]?: string;
};

export interface GravityColorsOptions extends BrandDependColorOptions {
    'base-misc-light'?: string;
    'line-generic'?: string;
    'base-generic'?: string;
    'base-generic-hover'?: string;
    'text-primary'?: string;
    'text-secondary'?: string;
    'text-complementary'?: string;
    'text-hint'?: string;
    'text-misc'?: string;
}

export interface BrandDependColorOptions {
    'base-brand'?: string;
    'base-background'?: string;
    'base-brand-hover'?: string;
    'base-selection'?: string;
    'base-selection-hover'?: string;
    'text-link'?: string;
    'text-link-hover'?: string;
    'text-brand'?: string;
    'text-brand-heavy'?: string;
    'line-brand'?: string;
}

export interface Theme extends Record<ThemeVariant, ThemeOptions> {}

export interface ThemeOptions {
    palette: Record<string, string>;
    colors: ColorsOptions;
}
