const esbuild = require('esbuild');
const tsPaths = require('./ts-paths');

const {version, dependencies = {}, peerDependencies = {}} = require('../package.json');

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

Promise.all([
    esbuild.build({
        tsconfig: './tsconfig.json',
        bundle: true,
        target: 'ES6',
        platform: 'browser',
        outfile: 'build/algolia-api.js',
        entryPoints: ['src/extensions/algolia/worker.ts'],
    })
].concat(builds.map(([entries, outfile, config]) => {
    const currentConfig = {
        ...commonConfig,
        ...config,
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
        ...Object.keys(peerDependencies),
        '@diplodoc/cli/package',
    ];

    return esbuild.build(currentConfig);
})));
