const {basename, dirname} = require("node:path");
const esbuild = require('esbuild');
const tsPaths = require('./ts-paths');
const local = require('./local');
const {sync: glob} = require('glob');

const {version, dependencies = {}, peerDependencies = {}} = require('../package.json');

const baseConfig = {
    tsconfig: './tsconfig.json',
    platform: 'node',
    target: 'ES6',
    sourcemap: true,
    define: {
        VERSION: JSON.stringify(version),
    },
};

const lib = (root, entry, format) => ({
    ...baseConfig,
    format,
    outfile: `${root}/${basename(dirname(entry))}.${format === 'esm' ? 'mjs' : 'cjs'}`,
    entryPoints: [entry],
    plugins:[
        local(),
        tsPaths(),
    ]
});

const commonConfig = {
    ...baseConfig,
    format: 'cjs',
    bundle: true,
    loader: {
        '.map': 'empty',
    },
    plugins:[
        tsPaths()
    ],
};

const builds = [
    [['src/index.ts'], 'build/index.js'],
    [['src/workers/linter/index.ts'], 'build/linter.js'],
];

const libs = glob('./src/core/*/index.ts');
const commands = glob('./src/commands/*/index.ts');

Promise.all([
    esbuild.build({
        tsconfig: './tsconfig.json',
        bundle: true,
        target: 'ES6',
        platform: 'browser',
        outfile: 'build/algolia-api.js',
        entryPoints: ['src/extensions/algolia/worker.ts'],
    }),
    ...libs.map((entry) => esbuild.build(lib('lib', entry, 'esm'))),
    ...libs.map((entry) => esbuild.build(lib('lib', entry, 'cjs'))),
    ...commands.map((entry) => esbuild.build(lib('commands', entry, 'esm'))),
    ...commands.map((entry) => esbuild.build(lib('commands', entry, 'cjs'))),
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
