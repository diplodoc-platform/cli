import {dirname, resolve} from 'path';
import shell from 'shelljs';
import {copyFileSync} from 'fs';
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
        copyFileSync(from, to);

        logger.copy(pathToAsset);
    }
}
