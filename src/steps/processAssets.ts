import walkSync from 'walk-sync';
import {resolve} from 'path';
import shell from 'shelljs';

import {BUNDLE_JS_FILENAME, BUNDLE_CSS_FILENAME, BUILD_FOLDER_PATH} from '../constants';
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

    const src = (file: string) => resolve(BUILD_FOLDER_PATH, file);
    const dst = (file: string) => resolve(outputBundlePath, file);

    /* Copy js bundle to user' output folder */
    shell.mkdir('-p', outputBundlePath);
    shell.cp(src(BUNDLE_JS_FILENAME), dst(BUNDLE_JS_FILENAME));
    shell.cp(src(BUNDLE_CSS_FILENAME), dst(BUNDLE_CSS_FILENAME));
}
