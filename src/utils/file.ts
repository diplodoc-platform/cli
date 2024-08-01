import {dirname, resolve} from 'path';
import {copyFile, stat} from 'node:fs/promises';
import shell from 'shelljs';
import {logger} from './logger';
import {Queue} from './queue';
import { RevisionMeta } from './meta';

export async function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
    meta?: RevisionMeta | null,
) { 
    const dirs = new Set<string>();

    const queue = new Queue(async (pathToAsset: string) => {
        const outputDir = resolve(outputFolderPath, dirname(pathToAsset));
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);

        if (!dirs.has(outputDir)) {
            dirs.add(outputDir);
            shell.mkdir('-p', outputDir);
        }
        
        if (await isFileModified(pathToAsset, from, meta)) {
            await copyFile(from, to);
            logger.copy(pathToAsset);
        }
    }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));

    files.forEach(queue.add);

    await queue.loop();
}

async function isFileModified(pathToAsset: string, from: string, meta?: RevisionMeta | null) {
    if (!meta) {
        return true;
    }

    if (!meta.files[pathToAsset]) {
        return true;
    }
    
    try {
        const data = await stat(from);
    
        const folderLMM = Number(data.mtime);
        
        const res = Math.abs(folderLMM - meta.files[pathToAsset].mod_date) < 1000;
        if (res) {
            return false;
        }
    } catch (_) {
        return true;
    }

    return true;
}
