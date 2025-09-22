import type {Run} from './run';

import {processChangelogs} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';

export async function handler(run: Run) {
    try {
        if (run.config.addMapFile) {
            await prepareMapFile(run);
        }

        await processChangelogs(run);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
        run.logger.error(error);
    }
}
