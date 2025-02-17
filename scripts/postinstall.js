const {join, resolve, dirname} = require("path");
const shell = require("shelljs");
const clientManifest = require('@diplodoc/client/manifest');
const CLIENT_PATH = dirname(require.resolve('@diplodoc/client/manifest'));
const ASSETS_PATH = resolve(__dirname, '..', 'assets');

const MERMAID_PATH = dirname(require.resolve('@diplodoc/mermaid-extension/runtime'));
const LATEX_PATH = dirname(require.resolve('@diplodoc/latex-extension/runtime'));
const SEARCH_PATH = dirname(require.resolve('@diplodoc/search-extension/worker'));

const assets = [
    ...clientManifest.app.js,
    ...clientManifest.app.css,
    ...clientManifest.app.async,
    ...clientManifest.search.js,
    ...clientManifest.search.css,
    ...clientManifest.search.async
];

shell.rm('-rf', ASSETS_PATH);
shell.mkdir('-p', ASSETS_PATH);
shell.mkdir('-p', join(ASSETS_PATH, 'search-extension'));
shell.mkdir('-p', join(ASSETS_PATH, 'search-extension/langs'));

shell.cp('-f', join(MERMAID_PATH, 'index-node.js'), join(ASSETS_PATH, 'mermaid-extension.js'));
shell.cp('-f', join(LATEX_PATH, 'index.js'), join(ASSETS_PATH, 'latex-extension.js'));
shell.cp('-f', join(LATEX_PATH, 'index.css'), join(ASSETS_PATH, 'latex-extension.css'));
shell.cp('-f', join(SEARCH_PATH, 'index.js'), join(ASSETS_PATH, 'search-extension/api.js'));
shell.cp('-f', join(SEARCH_PATH, 'langs/*.js'), join(ASSETS_PATH, 'search-extension/langs'));

for (const file of assets) {
    shell.cp('-f', join(CLIENT_PATH, file), join(ASSETS_PATH, file));
}
