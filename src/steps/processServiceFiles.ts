import {dirname, resolve} from 'path';
import walkSync from 'walk-sync';
import {readFileSync, writeFileSync} from 'fs';
import {load, dump} from 'js-yaml';
import log from '@doc-tools/transform/lib/log';

import {ArgvService, PresetService, TocService} from '../services';
import {logger} from '../utils';
import {DocPreset} from '../models';
import shell from 'shelljs';

type GetFilePathsByGlobalsFunction = (globs: string[]) => string[];

export function processServiceFiles(): void {
    const {input: inputFolderPath, ignore = []} = ArgvService.getConfig();

    const getFilePathsByGlobals = (globs: string[]): string[] => {
        return walkSync(inputFolderPath, {
            directories: false,
            includeBasePath: false,
            globs,
            ignore,
        });
    };

    preparingPresetFiles(getFilePathsByGlobals);
    preparingTocFiles(getFilePathsByGlobals);
}

function preparingPresetFiles(getFilePathsByGlobals: GetFilePathsByGlobalsFunction): void {
    const {
        input: inputFolderPath,
        varsPreset = '',
        outputFormat,
        applyPresets,
        resolveConditions,
    } = ArgvService.getConfig();

    try {
        const presetsFilePaths = getFilePathsByGlobals(['**/presets.yaml']);

        for (const path of presetsFilePaths) {
            logger.proc(path);

            const pathToPresetFile = resolve(inputFolderPath, path);
            const content = readFileSync(pathToPresetFile, 'utf8');
            const parsedPreset = load(content) as DocPreset;

            PresetService.add(parsedPreset, path, varsPreset);

            if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
                // Should save filtered presets.yaml only when --apply-presets=false or --resolve-conditions=false
                saveFilteredPresets(path, parsedPreset);
            }
        }
    } catch (error) {
        log.error(`Preparing presets.yaml files failed. Error: ${error}`);
        throw error;
    }
}

function saveFilteredPresets(path: string, parsedPreset: DocPreset): void {
    const {output: outputFolderPath, varsPreset = ''} = ArgvService.getConfig();

    const outputPath = resolve(outputFolderPath, path);
    const filteredPreset: Record<string, Object> = {
        default: parsedPreset.default,
    };

    if (parsedPreset[varsPreset]) {
        filteredPreset[varsPreset] = parsedPreset[varsPreset];
    }

    const outputPreset = dump(filteredPreset, {
        lineWidth: 120,
    });

    shell.mkdir('-p', dirname(outputPath));
    writeFileSync(outputPath, outputPreset);
}

function preparingTocFiles(getFilePathsByGlobals: GetFilePathsByGlobalsFunction): void {
    try {
        const tocFilePaths = getFilePathsByGlobals(['**/toc.yaml']);

        for (const path of tocFilePaths) {
            logger.proc(path);

            TocService.add(path);
        }
    } catch (error) {
        log.error(`Preparing toc.yaml files failed. Error: ${error}`);
        throw error;
    }
}
