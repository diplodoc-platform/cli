import {BrandDependColorOptions, ThemeVariant} from './types';

export const THEME_VARIANTS: ThemeVariant[] = ['light', 'dark'];

export const THEME_GRAVITY_VARIABLE_PREFIX = '--g-color';

export const THEME_YFM_VARIABLE_PREFIX = '--yfm-color';

export const BRAND_COLOR_VARIABLE_PREFIX = `${THEME_GRAVITY_VARIABLE_PREFIX}-private-brand`;

export const DEFAULT_BRAND_DEPEND_COLORS: Record<
    ThemeVariant,
    Required<BrandDependColorOptions>
> = {
    light: {
        'base-brand': 'rgb(82, 130, 255)',
        'base-background': 'rgb(255,255,255)',
        'base-brand-hover': 'var(--g-color-private-brand-650-solid)',
        'base-selection': 'var(--g-color-private-brand-150)',
        'base-selection-hover': 'var(--g-color-private-brand-300)',
        'text-link': 'var(--g-color-private-brand-700-solid)',
        'text-link-hover': 'var(--g-color-private-brand-850-solid)',
        'text-brand': 'var(--g-color-private-brand-700-solid)',
        'text-brand-heavy': 'var(--g-color-private-brand-850-solid)',
        'line-brand': 'var(--g-color-private-brand-550-solid)',
    },
    dark: {
        'base-brand': 'rgb(82, 130, 255)',
        'base-background': 'rgb(45, 44, 51)',
        'base-brand-hover': 'var(--g-color-private-brand-650-solid)',
        'base-selection': 'var(--g-color-private-brand-150)',
        'base-selection-hover': 'var(--g-color-private-brand-300)',
        'text-link': 'var(--g-color-private-brand-600-solid)',
        'text-link-hover': 'var(--g-color-private-brand-850-solid)',
        'text-brand': 'var(--g-color-private-brand-600-solid)',
        'text-brand-heavy': 'var(--g-color-private-brand-850-solid)',
        'line-brand': 'var(--g-color-private-brand-550-solid)',
    },
};

export const PRIVATE_SOLID_VARIABLES = [
    1000, 950, 900, 850, 800, 750, 700, 650, 600, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50,
];

export const PRIVATE_VARIABLES = [500, 450, 400, 350, 300, 250, 200, 150, 100, 50];

export const COLOR_MAP = {
    50: {a: 0.1, c: -1},
    100: {a: 0.15, c: -1},
    150: {a: 0.2, c: -1},
    200: {a: 0.3, c: -1},
    250: {a: 0.4, c: -1},
    300: {a: 0.5, c: -1},
    350: {a: 0.6, c: -1},
    400: {a: 0.7, c: -1},
    450: {a: 0.8, c: -1},
    500: {a: 0.9, c: -1},
    550: {a: 1, c: 1},
    600: {a: 0.9, c: 1},
    650: {a: 0.8, c: 1},
    700: {a: 0.7, c: 1},
    750: {a: 0.6, c: 1},
    800: {a: 0.5, c: 1},
    850: {a: 0.4, c: 1},
    900: {a: 0.3, c: 1},
    950: {a: 0.2, c: 1},
    1000: {a: 0.15, c: 1},
};
