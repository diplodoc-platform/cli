import {dirname, resolve} from 'path';
import {copyFile, readFile, stat, writeFile} from 'node:fs/promises';
import shell from 'shelljs';
import {logger} from './logger';
import {Queue} from './queue';

const FILE_META_NAME = '.file.meta.json';

export interface RevisionMeta {
    files: {
        [key: string]: {
            mod_date: number;
        };
    };
}

export async function makeMetaFile(
    userOutputFolder: string,
    outputFolderPath: string,
    files: string[],
) { 
    const meta: RevisionMeta['files'] = {};

    const queue = new Queue(async (pathToAsset: string) => {
        const from = resolve(outputFolderPath, pathToAsset);

        try {
            const data = await stat(from);
        
            meta[pathToAsset] = {
                mod_date: Number(data.mtime)
            };
        } catch (error) {
            
        }

    }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));

    files.forEach(queue.add);

    await queue.loop();

    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    // shell.rm('-rf', outputFile);

    await writeFile(outputFile, JSON.stringify({
        files: meta,
    }, null, 4), { encoding: 'utf8' });

    console.log(outputFile);
}

export async function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
    meta?: any,
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
            console.log(from, to);
            
            logger.copy(pathToAsset);
        }
    }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));

    files.forEach(queue.add);

    await queue.loop();
}

export async function getMetaFile(userOutputFolder: string): Promise<RevisionMeta | null> {
    const outputFile = resolve(userOutputFolder, FILE_META_NAME);

    try {
        return JSON.parse(await readFile(outputFile, 'utf8'));
    } catch (_) {
        return null;
    }
}

async function isFileModified(pathToAsset: string, from: string, meta?: RevisionMeta) {
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
