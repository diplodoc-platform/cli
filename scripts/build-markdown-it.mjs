import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

import {writeBundledLicenses} from './bundled-licenses.mjs';
import {markdownItSourcesPlugin} from './markdown-it-sources.mjs';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Produce the closed, pinned CLI parser without lowering native Token fields. */
export async function buildMarkdownItRuntime() {
    const result = await build({
        absWorkingDir: projectRoot,
        stdin: {
            contents: "import MarkdownIt from 'markdown-it'; module.exports = MarkdownIt;",
            resolveDir: projectRoot,
            sourcefile: 'markdown-it-runtime-entry.js',
        },
        outfile: 'lib/markdown/markdown-it-runtime.cjs',
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'es2022',
        sourcemap: true,
        metafile: true,
        legalComments: 'eof',
        plugins: [markdownItSourcesPlugin()],
    });

    for (const output of Object.values(result.metafile.outputs)) {
        assert.equal(output.imports.filter((item) => item.external).length, 0);
    }

    const linkifyInputs = Object.keys(result.metafile.inputs).filter((input) =>
        /(?:^|\/)linkify-it\//.test(input),
    );
    assert.ok(linkifyInputs.length, 'Expected bundled linkify-it inputs');
    for (const input of linkifyInputs) {
        let directory = dirname(resolve(projectRoot, input));
        while (basename(directory) !== 'linkify-it' && directory !== dirname(directory)) {
            directory = dirname(directory);
        }
        const {name, version} = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
        assert.equal(name, 'linkify-it');
        assert.match(version, /^6\./, 'The private parser must not capture the legacy linkifier');
    }

    writeBundledLicenses(
        result.metafile,
        projectRoot,
        join(projectRoot, 'lib/markdown/markdown-it-runtime.LICENSES.txt'),
    );
}
