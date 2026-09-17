import type {Run} from '~/commands/build';

import {dirname} from 'node:path';

import {SourceError} from './types';

/**
 * Downloads a file unless it is already on disk.
 *
 * This happens lazily, at the moment a directive is resolved, because the set of
 * needed files is only known once documents are parsed — and that happens in
 * worker threads. Two workers may therefore download the same file at once; the
 * write is atomic (temp + rename), so the worst case is a duplicated GET, not a
 * torn file. That trade is acceptable for a single object and would not be for a
 * repository clone.
 */
export async function download(run: Run, url: string, target: AbsolutePath) {
    if (run.exists(target)) {
        return target;
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new SourceError(`GET ${url} failed with ${response.status} ${response.statusText}`);
    }

    const content = await response.text();

    await run.fs.mkdir(dirname(target), {recursive: true});

    const temp = `${target}.${process.pid}.tmp`;

    try {
        await run.fs.writeFile(temp, content, 'utf8');
        await run.fs.rename(temp, target);
    } catch (error) {
        await run.fs.unlink(temp).catch(() => {});
        throw error;
    }

    return target;
}
