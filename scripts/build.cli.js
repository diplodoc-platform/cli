const {resolve, join, dirname} = require('path');
const esbuild = require('esbuild');
const tsPaths = require('./ts-paths');
const shell = require('shelljs');

const SEARCH_API = require.resolve('@diplodoc/search-extension/worker');
const SEARCH_LANGS = require.resolve('@diplodoc/search-extension/worker/langs');
const CLIENT_PATH = dirname(require.resolve('@diplodoc/client/manifest'));
const ASSETS_PATH = resolve(__dirname, '..', 'assets');

// TODO: link with constants
const SEARCH_API_OUTPUT = join(ASSETS_PATH, 'search', 'index.js');
const SEARCH_LANGS_OUTPUT = join(ASSETS_PATH, 'search', 'langs');

const clientManifest = require('@diplodoc/client/manifest');
const assets = [
    ...clientManifest.app.js,
    ...clientManifest.app.css,
    ...clientManifest.app.async,
    ...clientManifest.search.js,
    ...clientManifest.search.css,
    ...clientManifest.search.async
];

const {version, dependencies} = require('../package.json');

const commonConfig = {
    tsconfig: './tsconfig.json',
    platform: 'node',
    target: 'ES6',
    format: 'cjs',
    bundle: true,
    sourcemap: true,
    loader: {
        '.map': 'empty',
    },
    plugins:[
        tsPaths()
    ],
    define: {
        VERSION: JSON.stringify(version),
    },
};

const builds = [
    [['src/index.ts'], 'build/index.js'],
    [['src/workers/linter/index.ts'], 'build/linter.js'],
    [['src/reCli/workers/transform.ts'], 'build/workers/transform.js'],
];

Promise.all(builds.map(([entries, outfile]) => {
    const currentConfig = {
        ...commonConfig,
        entryPoints: entries,
        outfile,
    };

    if (outfile.endsWith('index.js')) {
        currentConfig.banner = {
            js: '#!/usr/bin/env node',
        };
    }

    currentConfig.external = [
        ...Object.keys(dependencies),
        '@diplodoc/cli/package',
    ];

    return esbuild.build(currentConfig);
})).then(() => {
    shell.mkdir('-p', ASSETS_PATH);
    for (const file of assets) {
        shell.cp('-f', join(CLIENT_PATH, file), join(ASSETS_PATH, file));
    }

    shell.mkdir('-p', SEARCH_LANGS_OUTPUT);
    shell.cp('-f', SEARCH_API, SEARCH_API_OUTPUT);
    shell.cp('-f', join(dirname(SEARCH_LANGS), '*.js'), SEARCH_LANGS_OUTPUT);
});
