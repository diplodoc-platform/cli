import {dirname, resolve} from 'path';
import shell from 'shelljs';
import {logger} from './logger';

export function copyFiles(
    inputFolderPath: string,
    outputFolderPath: string,
    files: string[],
): void {
    const dirs = new Set<string>();

    files.forEach((pathToAsset) => {
        const outputDir = resolve(outputFolderPath, dirname(pathToAsset));
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);

        if (!dirs.has(outputDir)) {
            dirs.add(outputDir);
            shell.mkdir('-p', outputDir);
        }

        shell.cp(from, to);

        logger.copy(pathToAsset);
    });
}
