import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve, sep} from 'node:path';

/**
 * Resolve the exact upstream TypeScript embedded in the installed source map.
 * @returns {object} The esbuild plugin for the pinned runtime sources.
 */
export function markdownItSourcesPlugin() {
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve('markdown-it/package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.name !== 'markdown-it' || manifest.version !== '15.0.3') {
        throw new Error(
            `The optimized parser requires markdown-it@15.0.3, got ${manifest.version}`,
        );
    }

    const root = dirname(manifestPath);
    const mapPath = join(root, 'dist/markdown-it.mjs.map');
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    const sourceRoot = join(root, 'src');
    const sources = new Map();
    for (const [index, source] of map.sources.entries()) {
        if (!source.startsWith('../src/') || !source.endsWith('.ts')) continue;

        const path = resolve(dirname(mapPath), source);
        if (
            !path.startsWith(`${sourceRoot}${sep}`) ||
            typeof map.sourcesContent[index] !== 'string'
        ) {
            throw new Error(`Invalid embedded Markdown-it source: ${source}`);
        }
        sources.set(path, map.sourcesContent[index]);
    }
    const entry = join(sourceRoot, 'index.ts');
    if (!sources.has(entry) || !sources.has(join(sourceRoot, 'token.ts'))) {
        throw new Error('The pinned Markdown-it package is missing its embedded runtime sources');
    }
    const license = readFileSync(join(root, 'LICENSE'), 'utf8');
    sources.set(
        entry,
        `/*! @license markdown-it ${manifest.version}\n${license}\n*/\n${sources.get(entry)}`,
    );

    return {
        name: 'markdown-it-native-fields',
        setup(build) {
            build.onResolve({filter: /^markdown-it$/}, () => ({path: entry}));
            build.onResolve({filter: /^\./}, ({path, importer, resolveDir}) => {
                const resolved = resolve(
                    sources.has(importer) ? dirname(importer) : resolveDir,
                    path,
                );
                return sources.has(resolved) ? {path: resolved} : undefined;
            });
            build.onLoad({filter: /\.ts$/}, ({path}) => {
                const contents = sources.get(path);
                return contents === undefined
                    ? undefined
                    : {contents, loader: 'ts', resolveDir: root};
            });
        },
    };
}
