import {dirname, resolve} from 'path';
import shell from 'shelljs';
import * as fs from 'fs';
import {logger} from './logger';

export function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
): void {
    for (const pathToAsset of files) {
        const outputDir: string = resolve(outputFolderPath, dirname(pathToAsset));
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);

        shell.mkdir('-p', outputDir);
        fs.copyFileSync(from, to);

        logger.copy(pathToAsset);
    }
}

export async function fileExists(path: string) {
    try {
        await fs.promises.stat(path);
        return true;
    } catch (err) {
        if ((err as Error & {code?: string}).code === 'ENOENT') {
            return false;
        }
        throw err;
    }
}
