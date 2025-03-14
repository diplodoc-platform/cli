import type {Run} from './run';

import {processChangelogs, processPages} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';

export async function handler(run: Run) {
    try {
        const {addMapFile} = run.config;

        if (addMapFile) {
            await prepareMapFile(run);
        }

        await processPages(run);

        await processChangelogs(run);
    } catch (error) {
        run.logger.error(error);
    }
}
