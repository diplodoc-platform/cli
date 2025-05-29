const {join, resolve, dirname} = require('node:path');
const {rmSync, mkdirSync, copyFileSync} = require('node:fs');
const {sync: glob} = require('glob')
const clientManifest = require('@diplodoc/client/manifest');

const ASSETS_PATH = resolve(__dirname, '..', 'assets');
const CLIENT_PATH = dirname(require.resolve('@diplodoc/client/manifest'));
const MERMAID_PATH = dirname(require.resolve('@diplodoc/mermaid-extension/runtime'));
const LATEX_PATH = dirname(require.resolve('@diplodoc/latex-extension/runtime'));
const SEARCH_PATH = dirname(require.resolve('@diplodoc/search-extension/worker'));
const PAGE_CONSTRUCTOR_PATH = dirname(require.resolve('@diplodoc/page-constructor-extension/runtime'));

const assets = [
    ...clientManifest.app.js,
    ...clientManifest.app.css,
    ...clientManifest.app.async,
    ...clientManifest.search.js,
    ...clientManifest.search.css,
    ...clientManifest.search.async
];

const langs = glob('langs/*.js', {cwd: SEARCH_PATH});

rmSync(ASSETS_PATH, {recursive: true, force: true});
mkdirSync(ASSETS_PATH, {recursive: true});
mkdirSync(join(ASSETS_PATH, 'search-extension'), {recursive: true});
mkdirSync(join(ASSETS_PATH, 'search-extension/langs'), {recursive: true});

copyFileSync(join(MERMAID_PATH, 'index-node.js'), join(ASSETS_PATH, 'mermaid-extension.js'));
copyFileSync(join(LATEX_PATH, 'index.js'), join(ASSETS_PATH, 'latex-extension.js'));
copyFileSync(join(LATEX_PATH, 'index.css'), join(ASSETS_PATH, 'latex-extension.css'));
copyFileSync(join(SEARCH_PATH, 'index.js'), join(ASSETS_PATH, 'search-extension/api.js'));
copyFileSync(join(PAGE_CONSTRUCTOR_PATH, 'index.js'), join(ASSETS_PATH, 'page-constructor-extension.js'));
copyFileSync(join(PAGE_CONSTRUCTOR_PATH, '../', 'index.css'), join(ASSETS_PATH, 'page-constructor-extension.css'));

for (const lang of langs) {
    copyFileSync(join(SEARCH_PATH, lang), join(ASSETS_PATH, 'search-extension', lang));
}

for (const file of assets) {
    copyFileSync(join(CLIENT_PATH, file), join(ASSETS_PATH, file));
}
