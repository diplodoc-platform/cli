import {basename, extname} from 'path';
import walkSync from 'walk-sync';

import {ArgvService, PresetService, TocService} from '../services';
import {logger} from '../utils';

/**
 * Processes services files (like toc.yaml, presets.yaml).
 * @return {void}
 */
export function processServiceFiles() {
    const {
        input: inputFolderPath,
        varsPreset = '',
        ignore = [],
    } = ArgvService.getConfig();

    const serviceFilePaths: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        globs: [
            '**/toc.yaml',
            '**/presets.yaml',
        ],
        ignore,
    });

    for (const path of serviceFilePaths) {
        const fileExtension: string = extname(path);
        const fileBaseName: string = basename(path, fileExtension);

        logger.proc(path);

        if (fileBaseName === 'presets') {
            PresetService.add(path, varsPreset);
        }

        if (fileBaseName === 'toc') {
            TocService.add(path);
        }
    }
}
