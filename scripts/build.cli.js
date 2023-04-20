const esbuild = require('esbuild');
const {version} = require('../package.json');

const commonConfig = {
    tsconfig: './tsconfig.json',
    packages: 'external',
    platform: 'node',
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

builds.forEach(([entries, target]) => {
    const currentConfig = {
        ...commonConfig,
        entryPoints: entries,
        outfile: target,
    };

    if (target.endsWith('index.js')) {
        currentConfig.banner = {
            js: '#!/usr/bin/env node',
        };
    }

    esbuild.build(currentConfig);
});
