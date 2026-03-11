import type {ColorVariant, UtilityColorKey} from './types';

import {dirname} from 'node:path';

export const ROOT = dirname(require.resolve('@diplodoc/cli/package'));

export const THEME_CONFIG_FILENAME = 'theme.yaml';

export const BASE_BRAND = 'base-brand';

export const APP_CSS_PREFIX = 'app-';
export const RTL_CSS_SUFFIX = '.rtl.css';

export const THEME_VARIANTS: ColorVariant[] = ['light', 'dark'];

export const UTILITY_COLORS: UtilityColorKey[] = [
    BASE_BRAND,
    'base-selection',
    'base-background',
    'text-primary',
    'text-secondary',
    'base-simple-hover',
    'line-generic',
];

export const YFM_COLORS = [
    'note-info-background',
    'note-tip-background',
    'note-warning-background',
    'note-important-background',
    'quote',
    'tab-active',
    'tab-text',
    'tab-text-hover',
    'link',
    'link-hover',
    'term-dfn-background',
    'code',
    'code-background',
    'inline-code',
    'inline-code-background',
    'table',
    'table-row-background',
    'table-background',
    'table-border',
];

export const DC_COLORS = [
    'mini-toc-border',
    'mini-toc',
    'mini-toc-hover',
    'mini-toc-active',
    'mini-toc-active-border',
];

export const ALL_COLORS = [...UTILITY_COLORS, ...YFM_COLORS, ...DC_COLORS];
