import {plugins} from '@doc-tools/transform';
import {dirname} from 'path';

export const BUILD_FOLDER = 'build';
export const BUNDLE_FOLDER = '_bundle';
export const BUNDLE_FILENAME = 'app.js';
export const TMP_INPUT_FOLDER = '.tmp_input';
export const TMP_OUTPUT_FOLDER = '.tmp_output';
export const MAIN_TIMER_ID = 'Build time';
export const SINGLE_PAGE_FOLDER = '_single_page';

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

export const BUILD_FOLDER_PATH = dirname(process.mainModule?.filename || '');

const {notes, attrs, anchors, code, cut, deflist, includes, imsize, meta, sup, tabs, links, images, video} = plugins;
export const YFM_PLUGINS = [
    attrs,
    meta,
    deflist,
    includes,
    cut,
    links,
    images,
    notes,
    anchors,
    tabs,
    code,
    imsize,
    sup,
    video,
];

export const PROCESSING_HAS_BEEN_FINISHED = 'Processing file has been finished. File path';
export const getMsgСonfigurationMustBeProvided =
    (repo: string) => `Сonfiguration must be provided for ${repo} like env variable or in .yfm file`;
