import type {ColorVariant, UtilityColorKey} from './types';

export const THEME_CONFIG_FILENAME = 'theme.yaml';

export const BASE_BRAND = 'base-brand';

export const APP_CSS_PREFIX = 'app-';
export const RTL_CSS_SUFFIX = '.rtl.css';

export const THEME_VARIANTS: ColorVariant = ['light', 'dark'];

export const UTILITY_COLORS: UtilityColorKey[] = [
    BASE_BRAND,
    'base-selection',
    'text-link',
    'text-link-hover',
    'base-background',
    'base-misc-light',
    'base-generic',
];

export const YFM_COLORS = [
    'note-info-background',
    'note-tip-background',
    'note-warning-background',
];

export const ALL_COLORS = [...UTILITY_COLORS, ...YFM_COLORS];
