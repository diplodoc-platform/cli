const esbuild = require('esbuild');
const {version} = require('../package.json');

const ignoreSCSS = {
    name: 'empty-scss-imports',
    setup(build) {
        build.onLoad({filter: /\.(scss|svg)$/}, () => ({contents: ''}));
    },
};

const externalPackagesPlugin = {
    name: 'externalPackages',
    setup(build) {
        build.onResolve({filter: /.*/}, (args) => {
            return {
                external:
                    !/^\./.test(args.path) &&
                    !/@doc-tools\/transform\/dist\/css/.test(args.path) &&
                    !/@diplodoc\/mermaid-extension/.test(args.path) &&
                    !/@doc-tools\/components/.test(args.path),
            };
        });
    },
};

const commonConfig = {
    tsconfig: './tsconfig.json',
    platform: 'node',
    bundle: true,
    sourcemap: true,
    plugins: [externalPackagesPlugin, ignoreSCSS],
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
