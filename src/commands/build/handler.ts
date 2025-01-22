import type {Run} from './run';

import {ArgvService, PresetService, SearchService} from '~/services';
import {processAssets, processChangelogs, processLinter, processLogs, processPages} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';

import {legacyConfig} from './legacy-config';

export async function handler(run: Run) {
    try {
        ArgvService.init(legacyConfig(run));
        SearchService.init();
        PresetService.init(run.vars);

        const {addMapFile} = ArgvService.getConfig();

        if (addMapFile) {
            prepareMapFile(run);
        }

        await Promise.all([processLinter(run), processPages(run)]);

        // process additional files
        await processAssets(run);

        await processChangelogs();

        await SearchService.release();
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}
