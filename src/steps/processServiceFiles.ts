import {basename, dirname, extname, resolve} from 'path';
import walkSync from 'walk-sync';
import {readFileSync, writeFileSync} from 'fs';
import {safeLoad, safeDump} from 'js-yaml';

import {ArgvService, PresetService, TocService} from '../services';
import {logger} from '../utils';
import {DocPreset} from '../models';
import shell from 'shelljs';

/**
 * Processes services files (like toc.yaml, presets.yaml).
 * @return {void}
 */
export function processServiceFiles() {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        varsPreset = '',
        ignore = [],
        outputFormat,
        applyPresets,
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
            const pathToPresetFile = resolve(inputFolderPath, path);
            const content = readFileSync(pathToPresetFile, 'utf8');
            const parsedPreset: DocPreset = safeLoad(content);

            PresetService.add(parsedPreset, path, varsPreset);

            if (outputFormat === 'md' && !applyPresets) {
                /* Should save filtered presets.yaml only when --apply-presets=false */
                const outputPath = resolve(outputFolderPath, path);
                const filteredPreset: Record<string, Object> = {
                    default: parsedPreset.default,
                };

                if (parsedPreset[varsPreset]) {
                    filteredPreset[varsPreset] = parsedPreset[varsPreset];
                }

                const outputPreset = safeDump(filteredPreset, {
                    lineWidth: 120,
                });

                shell.mkdir('-p', dirname(outputPath));
                writeFileSync(outputPath, outputPreset);
            }
        }

        if (fileBaseName === 'toc') {
            TocService.add(path);
        }
    }
}
