import {dirname, resolve} from 'path';
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
        resolveConditions,
    } = ArgvService.getConfig();

    const presetsFilePaths: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        globs: [
            '**/presets.yaml',
        ],
        ignore,
    });

    for (const path of presetsFilePaths) {
        logger.proc(path);

        const pathToPresetFile = resolve(inputFolderPath, path);
        const content = readFileSync(pathToPresetFile, 'utf8');
        const parsedPreset: DocPreset = safeLoad(content);

        PresetService.add(parsedPreset, path, varsPreset);

        if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
            /* Should save filtered presets.yaml only when --apply-presets=false or --resolve-conditions=false */
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

    const tocFilePaths: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        globs: [
            '**/toc.yaml',
        ],
        ignore,
    });

    for (const path of tocFilePaths) {
        logger.proc(path);

        TocService.add(path);
    }
}
