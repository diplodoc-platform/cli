const {resolve, join, dirname} = require('path');
const esbuild = require('esbuild');
const tsPaths = require('./ts-paths');
const shell = require('shelljs');

const CLIENT_PATH = dirname(require.resolve('@diplodoc/client/manifest'));
const ASSETS_PATH = resolve(__dirname, '..', 'assets');

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
    for (const file of assets) {
        shell.mkdir('-p', ASSETS_PATH);
        shell.cp('-f', join(CLIENT_PATH, file), join(ASSETS_PATH, file));
    }
});
