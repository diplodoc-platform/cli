import walkSync from 'walk-sync';

import {ArgvService} from '../services';
import {copyFiles} from '../utils';

import {ASSETS_FOLDER, RTL_LANGS} from '../constants';

/**
 * Processes assets files (everything except .yaml and .md files)
 * @param {string} outputBundlePath
 * @return {void}
 */
export function processAssets(outputBundlePath: string) {
    const {input: inputFolderPath, output: outputFolderPath, langs} = ArgvService.getConfig();

    const documentationAssetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    copyFiles(inputFolderPath, outputFolderPath, documentationAssetFilePath);

    const hasRTLlang = hasIntersection(langs, RTL_LANGS);
    const bundleAssetFilePath: string[] = walkSync(ASSETS_FOLDER, {
        directories: false,
        includeBasePath: false,
        ignore: !hasRTLlang && ['**/*.rtl.css'],
    });

    copyFiles(ASSETS_FOLDER, outputBundlePath, bundleAssetFilePath);
}

function hasIntersection(array1, array2) {
    const set1 = new Set(array1);
    return array2.some((element) => set1.has(element));
}
