import walkSync from 'walk-sync';
import {dirname, resolve} from 'path';
import shell from 'shelljs';
import {copyFileSync} from 'fs';

import {BUNDLE_FILENAME, BUILD_FOLDER_PATH} from '../constants';
import {ArgvService} from '../services';
import {logger} from '../utils';

/**
 * Processes assets files (everything except .yaml and .md files)
 * @return
 */
export function processAssets(outputBundlePath: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
    } = ArgvService.getConfig();

    const assetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: [
            '**/*.yaml',
            '**/*.md',
        ],
    });

    for (const pathToAsset of assetFilePath) {
        const outputDir: string = resolve(outputFolderPath, dirname(pathToAsset));
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);

        shell.mkdir('-p', outputDir);
        copyFileSync(from, to);

        logger.copy(pathToAsset);
    }

    /* Copy js bundle to user' output folder */
    const sourceBundlePath = resolve(BUILD_FOLDER_PATH, BUNDLE_FILENAME);
    const destBundlePath = resolve(outputBundlePath, BUNDLE_FILENAME);
    shell.mkdir('-p', outputBundlePath);
    shell.cp(sourceBundlePath, destBundlePath);
}
