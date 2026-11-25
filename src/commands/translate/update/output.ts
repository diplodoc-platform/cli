import {ok} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {lstat, mkdir, open, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';

export async function writeAtomic(path: AbsolutePath, content: string, mode?: number) {
    await mkdir(dirname(path), {recursive: true});
    const temporary = join(dirname(path), '.' + randomUUID());
    try {
        await writeFile(temporary, content, {flag: 'wx', mode});
        await rename(temporary, path);
    } finally {
        await rm(temporary, {force: true});
    }
}

// Resolve existing parent symlinks even when the destination has not been created.
export async function canonicalPath(path: AbsolutePath): Promise<AbsolutePath> {
    try {
        return (await realpath(path)) as AbsolutePath;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return join(await canonicalPath(dirname(path)), basename(path));
    }
}

export async function writeTranslation(
    output: AbsolutePath,
    relative: string,
    expected: string | null,
    content: string,
) {
    await mkdir(output, {recursive: true});
    const root = await realpath(output);
    const path = join(root, relative);
    let directory = root;
    for (const part of relative.split('/').slice(0, -1)) {
        directory = join(directory, part);
        await mkdir(directory).catch((error) => {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        });
        ok((await lstat(directory)).isDirectory(), 'Target directory contains a symbolic link');
    }
    const lock = path + '.yfm-update.lock';
    const handle = await open(lock, 'wx');
    try {
        await replaceSnapshot(path, expected, content);
    } finally {
        await handle.close();
        await rm(lock);
    }
}

async function replaceSnapshot(path: AbsolutePath, expected: string | null, content: string) {
    const existing = await lstat(path).catch((error) => {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return null;
    });
    if (existing) {
        ok(existing.isFile(), 'Target must be a regular file');
        const current = await readFile(path, 'utf8');
        if (current === content) {
            return;
        }
        ok(current === expected, 'Target changed since the update snapshot');
    }
    await writeAtomic(path, content, existing?.mode);
}
