import {plugins} from 'yfm-transform';
import {dirname} from 'path';

export const BUILD_FOLDER = 'build';
export const BUNDLE_FOLDER = '_bundle';
export const BUNDLE_FILENAME = 'app.js';
export const TMP_INPUT_FOLDER = '.tmp_input';
export const TMP_OUTPUT_FOLDER = '.tmp_output';
export const MAIN_TIMER_ID = 'Build time';

export const BUILD_FOLDER_PATH = dirname(process.mainModule?.filename || '');

const {notes, attrs, anchors, code, cut, deflist, includes, imsize, meta, sup, tabs, links, images} = plugins;
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
];
