import {resolve} from 'path';
import {readFile, stat, unlink, writeFile} from 'node:fs/promises';
import {logger} from './logger';
import {Queue} from './queue';
import { RevisionMeta } from '@diplodoc/transform/lib/typings';

const FILE_META_NAME = '.revision.meta.json';

export async function makeMetaFile(
    userOutputFolder: string,
    outputFolderPath: string,
    files: string[],
    currentMeta: RevisionMeta | undefined | null,
) { 
    const meta: RevisionMeta['files'] = {};
    
    for (const file of Object.keys(currentMeta?.files ?? {})) {
        if (!files.includes(file)) {
            delete currentMeta?.files[file];
        }
    }

    if (files.length) {
        const queue = new Queue(async (pathToAsset: string) => {
            const from = resolve(outputFolderPath, pathToAsset);
    
            try {
                const data = await stat(from);
            
                meta[pathToAsset] = {
                    mod_date: Number(data.mtime),
                    files: currentMeta?.files?.[pathToAsset]?.files || [],
                    changed: currentMeta?.files?.[pathToAsset]?.changed || false,
                };
            } catch (error) {
                // ignore
            }
    
        }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));
    
        files.forEach(queue.add);
    
        await queue.loop();
    }

    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        await unlink(outputFile);
    } catch (error) {
        // ignore
    }

    await writeFile(outputFile, JSON.stringify({
        files: meta,
    }, null, 4), { encoding: 'utf8' });
}

export async function getMetaFile(userOutputFolder: string): Promise<RevisionMeta | null> {
    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        return JSON.parse(await readFile(outputFile, 'utf8'));
    } catch (_) {
        return null;
    }
}

export async function getFileChangedMeta(
    cached: boolean,
    inputFolderPath: string,
    meta: RevisionMeta['files'] | undefined | null,
) {
    const files = Object.keys(meta ?? {});

    if (files.length) {
        const queue = new Queue(async (pathToAsset: string) => {
            if (meta?.[pathToAsset]) {
                const from = resolve(inputFolderPath, pathToAsset);
                meta[pathToAsset].changed = cached || await isFileModified(pathToAsset, from, meta);
            }
        }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));
    
        files.forEach(queue.add);
    
        await queue.loop();
    }
}

export async function isFileModified(pathToAsset: string, from: string, meta?: RevisionMeta['files'] | null) {
    if (!meta) {
        return true;
    }

    if (!meta[pathToAsset]) {
        return true;
    }
    
    try {
        const data = await stat(from);
    
        const folderLMM = Number(data.mtime);
        
        const res = Math.abs(folderLMM - meta[pathToAsset].mod_date) < 1000;
        if (res) {
            return false;
        }
    } catch (_) {
        return true;
    }

    return true;
}
