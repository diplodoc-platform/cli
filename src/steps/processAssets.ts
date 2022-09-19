import walkSync from 'walk-sync';
import {resolve} from 'path';
import shell from 'shelljs';

import {BUNDLE_FILENAME, BUILD_FOLDER_PATH} from '../constants';
import {ArgvService} from '../services';
import {copyFiles} from '../utils';

/**
 * Processes assets files (everything except .yaml and .md files)
 * @param {string} outputBundlePath
 * @return {void}
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

    copyFiles(inputFolderPath, outputFolderPath, assetFilePath);

    /* Copy js bundle to user' output folder */
    const sourceBundlePath = resolve(BUILD_FOLDER_PATH, BUNDLE_FILENAME);
    const destBundlePath = resolve(outputBundlePath, BUNDLE_FILENAME);
    shell.mkdir('-p', outputBundlePath);
    shell.cp(sourceBundlePath, destBundlePath);
}
