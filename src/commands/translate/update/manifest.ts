import type {Snapshot, UpdateEntry} from './types';

import {promises as fs, readFileSync} from 'node:fs';
import {lstat, realpath} from 'node:fs/promises';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';

function contained(root: string, path: string) {
    const rel = relative(root, path);
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
function logical(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !value ||
        value.includes('\\') ||
        value.includes('\0') ||
        isAbsolute(value) ||
        value.split('/').some((part) => !part || part === '..' || part === '.')
    ) {
        throw new Error('Invalid or escaping manifest path');
    }
    return value;
}
/** Check existing ancestors as well as the final output path. */
export async function checkOutputPath(root: string, path: string): Promise<string> {
    const base = await realpath(resolve(root));
    const output = resolve(base, logical(path));
    let existing = output;
    while (existing !== base) {
        try {
            await lstat(existing);
            if (!contained(base, await realpath(existing))) {
                throw new Error('Output symlink escape');
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
        existing = dirname(existing);
    }
    return output;
}
/** Validate the entire manifest before any provider requests. */
export async function loadUpdateManifest(options: {
    path: string;
    inputRoot: string;
    outputRoot: string;
    sourceLanguage: string;
    targetLanguage: string;
}): Promise<Snapshot[]> {
    const manifest: unknown = JSON.parse(await fs.readFile(resolve(options.path), 'utf8'));
    if (
        !manifest ||
        typeof manifest !== 'object' ||
        !('schemaVersion' in manifest) ||
        manifest.schemaVersion !== 1
    ) {
        throw new Error('Unsupported manifest schemaVersion');
    }
    if (!('files' in manifest) || !Array.isArray(manifest.files)) {
        throw new Error('Manifest files must be an array');
    }
    if (
        !options.sourceLanguage ||
        !options.targetLanguage ||
        options.sourceLanguage === options.targetLanguage
    ) {
        throw new Error('Incompatible language settings');
    }
    const directory = await realpath(resolve(dirname(options.path)));
    const sources = new Set<string>();
    const targets = new Set<string>();
    const entries: UpdateEntry[] = [];
    for (const value of manifest.files) {
        if (!value || typeof value !== 'object' || !['update', 'create'].includes(value.kind)) {
            throw new Error('Invalid manifest entry');
        }
        const sourcePath = logical(value.sourcePath);
        const targetPath = logical(value.targetPath);
        if (
            !sourcePath.startsWith(`${options.sourceLanguage}/`) ||
            !targetPath.startsWith(`${options.targetLanguage}/`) ||
            sourcePath.slice(options.sourceLanguage.length) !==
                targetPath.slice(options.targetLanguage.length)
        ) {
            throw new Error('Incompatible manifest language paths');
        }
        if (!sourcePath.endsWith('.md')) {
            throw new Error('Incremental mode supports Markdown only');
        }
        if (sources.has(sourcePath) || targets.has(targetPath)) {
            throw new Error('Duplicate manifest path');
        }
        sources.add(sourcePath);
        targets.add(targetPath);
        const sourceAfterPath = logical(value.sourceAfterPath);
        await checkOutputPath(options.outputRoot, targetPath);
        if (value.kind === 'update') {
            entries.push({
                kind: 'update',
                sourcePath,
                targetPath,
                sourceAfterPath,
                sourceBeforePath: logical(value.sourceBeforePath),
                targetBeforePath: logical(value.targetBeforePath),
            });
        } else {
            for (const root of [options.inputRoot, options.outputRoot]) {
                const target = await checkOutputPath(root, targetPath);
                try {
                    await lstat(target);
                    throw new Error('Create target already exists');
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                }
            }
            if ('sourceBeforePath' in value || 'targetBeforePath' in value) {
                throw new Error('Create entry cannot contain before snapshots');
            }
            entries.push({kind: 'create', sourcePath, targetPath, sourceAfterPath});
        }
    }
    const snapshot = async (path: string) => {
        const full = await realpath(resolve(directory, path));
        if (!contained(directory, full)) {
            throw new Error('Snapshot symlink escape');
        }
        return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(readFileSync(full));
    };
    return Promise.all(
        entries.map(async (entry) => ({
            entry,
            inputRoot: options.inputRoot,
            sourceBefore: entry.kind === 'update' ? await snapshot(entry.sourceBeforePath) : null,
            sourceAfter: await snapshot(entry.sourceAfterPath),
            targetBefore: entry.kind === 'update' ? await snapshot(entry.targetBeforePath) : null,
        })),
    );
}
