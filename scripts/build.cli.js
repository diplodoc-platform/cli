const {basename, dirname, join} = require('node:path');
const {chmod, copyFile, mkdir} = require('node:fs/promises');
const esbuild = require('esbuild');
const deps = require('./deps');
const alias = require('./alias');
const {sync: glob} = require('glob');

const {version, dependencies = {}} = require('../package.json');

require('./assets');

const baseConfig = {
    tsconfig: './tsconfig.json',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    bundle: true,
    define: {
        'global.VERSION': JSON.stringify(version),
    },
};

const externals = new Set();
const lib = (entry, format) => esbuild.build({
    ...baseConfig,
    format,
    outfile: `lib/${basename(dirname(entry))}/index.${format === 'esm' ? 'mjs' : 'js'}`,
    entryPoints: [entry],
    packages: 'external',
    plugins:[
        deps(externals),
        alias({
            '~/core': ['@diplodoc/cli/lib', true],
        }),
    ]
});
const build = async (entry, outfile, format) => {
    const file = `build/${outfile}.${format === 'esm' ? 'mjs' : 'js'}`;
    const config = {
        ...baseConfig,
        format,
        plugins: [
            alias({
                '~/core': ['@diplodoc/cli/lib', true],
                // '@diplodoc/cli/lib': ['../lib', true],
                '@diplodoc/cli$': ['../build', true],
            }),
        ],
        banner: {
            js: '#!/usr/bin/env node',
        },
        entryPoints: [entry],
        outfile: file,
    };

    config.external = [
        ...Object.keys(dependencies),
        '@diplodoc/cli',
        '@diplodoc/cli/lib',
        '@diplodoc/cli/package',
    ];

    await esbuild.build(config);

    await chmod(file, '755');
};

const extension = async (entry, outfile, format) => {
    const file = `build/${outfile}.${format === 'esm' ? 'mjs' : 'js'}`;
    const config = {
        ...baseConfig,
        format,
        plugins: [
            alias({
                '@diplodoc/cli/lib': ['../lib', true],
                '@diplodoc/cli$': ['../build', true],
            }),
        ],
        entryPoints: [entry],
        outfile: file,
    };

    config.external = [
        '@diplodoc/cli',
    ];

    await esbuild.build(config);
};

const copy = async (from, to) => {
    await mkdir(dirname(join(__dirname, '../build', to)), {recursive: true});
    await copyFile(from, join(__dirname, '../build', to));
};

const builds = [
    ['src/index.ts', 'index'],
];

const extensions = [
    ['src/extensions/mdit-plugins/index.ts', 'mdit-plugins'],
    ['src/extensions/github-vcs/index.ts', 'github-vcs'],
];

const libs = glob('./src/core/*/index.ts', {ignore: ['**/test/*']});

const files = [
    [require.resolve('@diplodoc/client/manifest'), 'manifest.json']
];

Promise.all([
    ...libs.map((entry) => lib(entry, 'esm')),
    ...libs.map((entry) => lib(entry, 'cjs')),
    ...builds.map(([entry, outfile]) => build(entry, outfile, 'esm')),
    ...builds.map(([entry, outfile]) => build(entry, outfile, 'cjs')),
    ...extensions.map(([entry, outfile]) => extension(entry, outfile, 'cjs')),
    ...files.map(([from, to]) => copy(from, to)),
]).then(() => {
    for (const dep of externals) {
        if (!dependencies[dep]) {
            throw new Error(`Dependency '${dep}' should be described in prod dependencies.`);
        }
    }
});
