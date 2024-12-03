import type {Run} from './run';

import 'threads/register';

import {glob} from 'glob';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {ArgvService, Includers, SearchService} from '~/services';
import {
    initLinterWorkers,
    preparingPresetFiles,
    preparingTocFiles,
    processAssets,
    processChangelogs,
    processExcludedFiles,
    processLinter,
    processLogs,
    processPages,
} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';

export async function handler(run: Run) {
    try {
        ArgvService.init(run.legacyConfig);
        SearchService.init();
        // TODO: Remove duplicated types from openapi-extension
        // @ts-ignore
        Includers.init([OpenapiIncluder]);

        const {lintDisabled, buildDisabled, addMapFile} = ArgvService.getConfig();

        const presets = (await glob('**/presets.yaml', {
            cwd: run.input,
            ignore: run.config.ignore,
        })) as RelativePath[];
        for (const preset of presets) {
            await run.vars.load(preset);
        }

        await preparingPresetFiles(run);
        await preparingTocFiles(run);
        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const outputBundlePath = run.bundlePath;

        if (!lintDisabled) {
            /* Initialize workers in advance to avoid a timeout failure due to not receiving a message from them */
            await initLinterWorkers();
        }

        const processes = [
            !lintDisabled && processLinter(),
            !buildDisabled && processPages(outputBundlePath),
        ].filter(Boolean) as Promise<void>[];

        await Promise.all(processes);

        if (!buildDisabled) {
            // process additional files
            processAssets(run);

            await processChangelogs();

            await SearchService.release();
        }
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}
