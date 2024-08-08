import {dirname, resolve} from 'path';
import {copyFile} from 'node:fs/promises';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import {RevisionMeta} from '@diplodoc/transform/lib/typings';
import {logger} from './logger';
import {Queue} from './queue';

export async function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
    meta?: RevisionMeta | null,
) { 
    if (files.length === 0) {
        return;
    }

    const dirs = new Set<string>();

    const queue = new Queue(async (pathToAsset: string) => {
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);
        const isChanged = meta?.files?.[pathToAsset]?.changed !== false;
        
        if (isChanged) {
            const outputDir = resolve(outputFolderPath, dirname(pathToAsset));

            if (!dirs.has(outputDir)) {
                dirs.add(outputDir);
                shell.mkdir('-p', outputDir);
            }
            
            await copyFile(from, to);
            logger.copy(pathToAsset);
        }
    }, 50, (error, pathToAsset) => logger.error(pathToAsset, error.message));

    files.forEach(queue.add);
    await queue.loop();
}

export function walk({
    folder,
    folders,
    globs,
    ignore,
    directories,
    includeBasePath,
}: {
    folder?: string;
    folders?: string[];
    globs?: string[];
    ignore?: string[];
    directories?: boolean;
    includeBasePath?: boolean;
}) {
    const dirs = [folder, ...(folders || [])].filter(Boolean) as string[];
    const files = dirs.map<string[]>(folder => walkSync(folder as string, {
        directories: directories,
        includeBasePath: includeBasePath,
        globs: globs || [],
        ignore: ignore || [],
    }));

    return [...new Set(files.flat())];
}
