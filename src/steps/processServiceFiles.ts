import {dirname, resolve} from 'path';
import {dump, load} from 'js-yaml';
import log from '@diplodoc/transform/lib/log';

import {ArgvService, PresetService, TocService} from '../services';
import {logger, walk} from '../utils';
import {DocPreset} from '../models';
import shell from 'shelljs';
import {FsContext} from '@diplodoc/transform/lib/typings';
import {RevisionContext} from '~/context/context';

type GetFilePathsByGlobalsFunction = (globs: string[]) => string[];

export async function processServiceFiles(context: RevisionContext, fs: FsContext): Promise<void> {
    const {input: inputFolderPath, ignore} = ArgvService.getConfig();

    const getFilePathsByGlobals = (globs: string[]): string[] => {
        return walk({
            folder: [inputFolderPath, context.userInputFolder],
            directories: false,
            includeBasePath: false,
            globs,
            ignore,
        });
    };

    await preparingPresetFiles(fs, getFilePathsByGlobals);
    await preparingTocFiles(fs, getFilePathsByGlobals);
}

async function preparingPresetFiles(
    fs: FsContext,
    getFilePathsByGlobals: GetFilePathsByGlobalsFunction,
) {
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
            const content = fs.read(pathToPresetFile);
            const parsedPreset = load(content) as DocPreset;

            PresetService.add(parsedPreset, path, varsPreset);

            if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
                // Should save filtered presets.yaml only when --apply-presets=false or --resolve-conditions=false
                saveFilteredPresets(fs, path, parsedPreset);
            }
        }
    } catch (error) {
        log.error(`Preparing presets.yaml files failed. Error: ${error}`);
        throw error;
    }
}

function saveFilteredPresets(fs: FsContext, path: string, parsedPreset: DocPreset): void {
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
    fs.write(outputPath, outputPreset);
}

async function preparingTocFiles(
    fs: FsContext,
    getFilePathsByGlobals: GetFilePathsByGlobalsFunction,
): Promise<void> {
    try {
        const tocFilePaths = getFilePathsByGlobals(['**/toc.yaml']);
        await TocService.init(fs, tocFilePaths);
    } catch (error) {
        log.error(`Preparing toc.yaml files failed. Error: ${error}`);
        throw error;
    }
}
