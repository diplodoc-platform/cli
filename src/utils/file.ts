import {dirname, resolve} from 'path';
import {copyFile} from 'node:fs/promises';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import {logger} from './logger';

export async function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
) {
    if (files.length === 0) {
        return;
    }

    const dirs = new Set<string>();

    for (const pathToAsset of files) {
        try {
            const from = resolve(inputFolderPath, pathToAsset);
            const to = resolve(outputFolderPath, pathToAsset);
            const outputDir = resolve(outputFolderPath, dirname(pathToAsset));

            if (!dirs.has(outputDir)) {
                dirs.add(outputDir);
                shell.mkdir('-p', outputDir);
            }

            await copyFile(from, to);

            logger.copy(pathToAsset);
        } catch (error) {
            logger.error(pathToAsset, error.message);
        }
    }
}

export function walkFolders({
    folder,
    globs,
    ignore,
    directories,
    includeBasePath,
}: {
    folder?: string | string[];
    globs?: string[];
    ignore?: string[];
    directories?: boolean;
    includeBasePath?: boolean;
}) {
    if (!Array.isArray(folder) && folder) {
        folder = [folder];
    }

    const dirs = [...(folder || [])].filter(Boolean) as string[];
    const files = dirs.map<string[]>((folder) =>
        walkSync(folder as string, {
            directories,
            includeBasePath,
            globs,
            ignore,
        }),
    );

    return [...new Set(files.flat())];
}
