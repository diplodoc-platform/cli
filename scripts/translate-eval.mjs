/**
 * Entry point for the translation eval harness: `npm run translate:eval`.
 *
 * The harness logic lives in TypeScript (src/commands/translate/eval/)
 * so it is typechecked, linted and unit-tested with the rest of the
 * project. This wrapper bundles it on the fly with esbuild and runs it.
 *
 * See docs/translate-eval.md for usage.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {build} from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cliBinary = join(root, 'build', 'index.js');

if (!existsSync(cliBinary)) {
    console.log('build/index.js not found, building the CLI first...');
    const npm = process.env.npm_execpath;
    const result = npm
        ? spawnSync(process.execPath, [npm, 'run', 'build'], {cwd: root, stdio: 'inherit'})
        : spawnSync('npm', ['run', 'build'], {cwd: root, stdio: 'inherit'});
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const outfile = join(mkdtempSync(join(tmpdir(), 'yfm-translate-eval-cli-')), 'cli.mjs');

await build({
    entryPoints: [join(root, 'src/commands/translate/eval/cli.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    logLevel: 'error',
});

const {main} = await import(pathToFileURL(outfile));

const defaults = [];
if (!process.argv.includes('--cli')) {
    defaults.push('--cli', cliBinary);
}
if (!process.argv.includes('--corpus')) {
    defaults.push('--corpus', join(root, 'tests/eval/corpus'));
}

main([...defaults, ...process.argv.slice(2)])
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
