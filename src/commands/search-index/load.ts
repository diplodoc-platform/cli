import type {SearchIndexer} from '~/core/search-index';

import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

/** Resolve adapters from the caller using Node's native ESM and CJS export conditions. */
export async function loadIndexer(provider: string, cwd = process.cwd()): Promise<SearchIndexer> {
    let url: string;
    try {
        // The resolver's module URL must belong to the caller, not the bundled CLI.
        const {stdout} = await promisify(execFile)(
            process.execPath,
            [
                '--input-type=module',
                '--eval',
                'process.stdout.write(import.meta.resolve(process.argv[1]))',
                '--',
                provider,
            ],
            {cwd, timeout: 30000},
        );
        url = stdout.trim();
    } catch {
        const resolve = createRequire(join(cwd, 'package.json'));
        url = pathToFileURL(resolve.resolve(provider)).href;
    }
    const module = await import(url);
    const indexer = module.default || module;
    if (!indexer || typeof indexer.index !== 'function') {
        throw new Error('Search indexer module must export index(corpus, options).');
    }
    return indexer;
}
