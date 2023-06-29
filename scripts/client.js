const path = require('path');

const CLIENT_PATH = path.dirname(require.resolve('@diplodoc/client'));
const BUILD_PATH = 'build';
const BUNDLE_PATH = '_bundle';
const BUNDLE_JS_FILENAME = 'app.client.js';
const BUNDLE_CSS_FILENAME = 'app.client.css';

const src = (target) => path.resolve(CLIENT_PATH, target);
const dst = (target) => path.resolve(BUILD_PATH, target);
const bundle = (target) => path.join('../', BUNDLE_PATH, target);


module.exports = {
    dst: {
        js: dst(BUNDLE_JS_FILENAME),
        css: dst(BUNDLE_CSS_FILENAME),
    },
    src: {
        js: src(BUNDLE_JS_FILENAME),
        css: src(BUNDLE_CSS_FILENAME),
    },
    bundle: {
        js: bundle(BUNDLE_JS_FILENAME),
        css: bundle(BUNDLE_CSS_FILENAME),
    },
};
