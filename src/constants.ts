import {resolve} from 'node:path';
import {platform} from 'process';
const os = require('os');

export const ASSETS_FOLDER = resolve(__dirname, '../assets');
export const BUNDLE_FOLDER = '_bundle';
export const TMP_INPUT_FOLDER = '.tmp_input';
export const TMP_OUTPUT_FOLDER = '.tmp_output';
export const MAIN_TIMER_ID = 'Build time';
export const YFM_CONFIG_FILENAME = '.yfm';
export const REDIRECTS_FILENAME = 'redirects.yaml';
export const LINT_CONFIG_FILENAME = '.yfmlint';
export const SINGLE_PAGE_FILENAME = 'single-page.html';
export const SINGLE_PAGE_DATA_FILENAME = 'single-page.json';
export const CUSTOM_STYLE = 'custom-style';
export const DEFAULT_CSP_SETTINGS: Record<string, string[]> = {
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

export const RTL_LANGS = [
    'ar',
    'arc',
    'ckb',
    'dv',
    'fa',
    'ha',
    'he',
    'khw',
    'ks',
    'ps',
    'sd',
    'ur',
    'uz_AF',
    'yi',
];

export enum Platforms {
    WINDOWS = 'win32',
    MAC = 'darwin',
    LINUX = 'linux',
}

export enum ResourceType {
    style = 'style',
    script = 'script',
    csp = 'csp',
}

export const CARRIAGE_RETURN = platform === Platforms.WINDOWS ? '\r\n' : '\n';

export const PROCESSING_FINISHED = 'Processing finished:';
export const LINTING_FINISHED = 'Linting finished:';

export const MIN_CHUNK_SIZE = Number(process.env.MIN_CHUNK_SIZE) || 1000;
export const WORKERS_COUNT = Number(process.env.WORKERS_COUNT) || os.cpus().length - 1;
export const PAGE_PROCESS_CONCURRENCY = Number(process.env.PAGE_PROCESS_CONCURRENCY) || 500;
