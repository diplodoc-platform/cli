import {resolve} from 'node:path';

export const VERSION = global.VERSION ? global.VERSION : '0.0.0';
export const MAIN_TIMER_ID = 'Build time';
export const ASSETS_FOLDER = resolve(__dirname, '../assets');
export const BUNDLE_FOLDER = '_bundle';
export const YFM_CONFIG_FILENAME = '.yfm';
export const LINT_CONFIG_FILENAME = '.yfmlint';
export const DEFAULT_CSP_SETTINGS: Hash<string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
};

export enum Stage {
    NEW = 'new',
    PREVIEW = 'preview',
    TECH_PREVIEW = 'tech-preview',
    SKIP = 'skip',
}

export enum Lang {
    RU = 'ru',
    EN = 'en',
}

export const PAGE_PROCESS_CONCURRENCY = Number(process.env.PAGE_PROCESS_CONCURRENCY) || 300;
