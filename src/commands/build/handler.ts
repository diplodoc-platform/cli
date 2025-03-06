import type {Run} from './run';

import {ArgvService, PresetService} from '~/services';
import {processChangelogs, processLinter, processLogs, processPages} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';

import {legacyConfig} from './legacy-config';

export async function handler(run: Run) {
    try {
        ArgvService.init(legacyConfig(run));
        PresetService.init(run.vars.entries);

        const {addMapFile} = run.config;

        if (addMapFile) {
            await prepareMapFile(run);
        }

        await Promise.all([processLinter(run), processPages(run)]);

        await processChangelogs(run);
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}
