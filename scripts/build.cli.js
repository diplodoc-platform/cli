const esbuild = require('esbuild');
const {version} = require('../package.json');

const config = {
    tsconfig: './tsconfig.json',
    packages: 'external',
    platform: 'node',
    bundle: true,
    sourcemap: true,
    define: {
        VERSION: JSON.stringify(version),
    },
};

const builds = [[['src/index.ts'], 'build/index.js'], [['src/workers/linter/index.ts'], 'build/linter.js']];

builds.forEach(([entries, target]) => {
    esbuild.build({
        ...config,
        entryPoints: entries,
        outfile: target,
    });
});
