import {dirname, resolve} from 'path';
import {dump, load} from 'js-yaml';
import log from '@diplodoc/transform/lib/log';

import {ArgvService, PresetService, TocService} from '../services';
import {logger, walkFolders} from '../utils';
import {DocPreset} from '../models';
import shell from 'shelljs';
import {FsContext} from '@diplodoc/transform/lib/typings';
import {RevisionContext} from '~/context/context';

const getFilePathsByGlobals = (globs: string[], context: RevisionContext): string[] => {
    const {ignore = []} = ArgvService.getConfig();

    return walkFolders({
        folder: [context.tmpInputFolder, context.userInputFolder],
        directories: false,
        includeBasePath: false,
        globs,
        ignore,
    });
};

export async function processServiceFiles(context: RevisionContext, fs: FsContext): Promise<void> {
    await preparingPresetFiles(context, fs);
    await preparingTocFiles(context, fs);
}

async function preparingPresetFiles(context: RevisionContext, fs: FsContext) {
    const {
        input: inputFolderPath,
        varsPreset = '',
        outputFormat,
        applyPresets,
        resolveConditions,
    } = ArgvService.getConfig();

    try {
        const presetsFilePaths = getFilePathsByGlobals(['**/presets.yaml'], context);

        for (const path of presetsFilePaths) {
            logger.proc(path);

            const pathToPresetFile = resolve(inputFolderPath, path);
            const content = await fs.readAsync(pathToPresetFile);
            const parsedPreset = load(content) as DocPreset;

            PresetService.add(parsedPreset, path, varsPreset);

            if (outputFormat === 'md' && (!applyPresets || !resolveConditions)) {
                // Should save filtered presets.yaml only when --apply-presets=false or --resolve-conditions=false
                await saveFilteredPresets(fs, path, parsedPreset);
            }
        }
    } catch (error) {
        log.error(`Preparing presets.yaml files failed. Error: ${error}`);
        throw error;
    }
}

async function saveFilteredPresets(
    fs: FsContext,
    path: string,
    parsedPreset: DocPreset,
): Promise<void> {
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
    await fs.writeAsync(outputPath, outputPreset);
}

async function preparingTocFiles(context: RevisionContext, fs: FsContext): Promise<void> {
    try {
        const tocFilePaths = getFilePathsByGlobals(['**/toc.yaml'], context);
        await TocService.init(fs, tocFilePaths);
    } catch (error) {
        log.error(`Preparing toc.yaml files failed. Error: ${error}`);
        throw error;
    }
}
