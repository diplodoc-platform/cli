import {basename, dirname, extname, resolve} from 'path';
import walkSync from 'walk-sync';
import shell from 'shelljs';
import {copyFileSync} from 'fs';

import {ArgvService, PresetService, TocService} from '../services';
import {logger} from '../utils';

/**
 * Processes services files (like toc.yaml, presets.yaml).
 * @return
 */
export function processServiceFiles() {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
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
            TocService.add(path, inputFolderPath);

            /* Should copy toc.yaml files to output dir only when running --output-format=md */
            if (outputFormat === 'md') {
                const outputDir = resolve(outputFolderPath, dirname(path));
                const from = resolve(inputFolderPath, path);
                const to = resolve(outputFolderPath, path);

                shell.mkdir('-p', outputDir);
                copyFileSync(from, to);
            }
        }
    }
}
