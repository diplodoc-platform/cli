const esbuild = require('esbuild');
const shell = require('shelljs');

const client = require('./client');
const {version, dependencies} = require('../package.json');
const {compilerOptions: {target}} = require('../tsconfig.json');

const diplodocExtensions = Object.keys(dependencies).filter((name) => name.startsWith('@diplodoc'));

for (const [type, path] of Object.entries(client.src)) {
    const dst = client.dst[type];

    shell.cp('-f', path, dst);
}

const commonConfig = {
    tsconfig: './tsconfig.json',
    packages: 'external',
    platform: 'node',
    target: target,
    format: 'cjs',
    bundle: true,
    sourcemap: true,
    define: {
        VERSION: JSON.stringify(version),
    },
};

const builds = [
    [['src/index.ts'], 'build/index.js'],
    [['src/workers/linter/index.ts'], 'build/linter.js'],
];

builds.forEach(([entries, outfile]) => {
    const currentConfig = {
        ...commonConfig,
        entryPoints: entries,
        outfile,
    };

    if (outfile.endsWith('index.js')) {
        currentConfig.banner = {
            js: '#!/usr/bin/env node',
        };
        currentConfig.external = diplodocExtensions;
    }

    esbuild.build(currentConfig);
});
