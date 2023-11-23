import walkSync from 'walk-sync';
import shell from 'shelljs';

import {ArgvService} from '../services';
import {copyFiles} from '../utils';

import {ASSETS_FOLDER} from '../constants';

/**
 * Processes assets files (everything except .yaml and .md files)
 * @param {string} outputBundlePath
 * @return {void}
 */
export function processAssets(outputBundlePath: string) {
    const {input: inputFolderPath, output: outputFolderPath} = ArgvService.getConfig();

    const assetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    copyFiles(inputFolderPath, outputFolderPath, assetFilePath);

    /* Copy js bundle to user' output folder */
    shell.mkdir('-p', outputBundlePath);
    shell.cp(ASSETS_FOLDER + '/*', outputBundlePath);
}
