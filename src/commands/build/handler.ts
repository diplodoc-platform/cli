import type {Run} from './run';

import 'threads/register';

import {ArgvService, PresetService, SearchService} from '~/services';
import {
    initLinterWorkers,
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
        PresetService.init(run.vars);

        const {lintDisabled, buildDisabled, addMapFile} = ArgvService.getConfig();

        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile(run);
        }

        if (!lintDisabled) {
            /* Initialize workers in advance to avoid a timeout failure due to not receiving a message from them */
            await initLinterWorkers(run);
        }

        const processes = [
            !lintDisabled && processLinter(run),
            !buildDisabled && processPages(run),
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
