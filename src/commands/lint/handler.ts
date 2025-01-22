import type {Run} from './run';

import {ArgvService, PluginService, PresetService} from '~/services';
import {processLogs} from '~/steps';
import {bounded, isExternalHref, logger, own} from '~/utils';
import {LINTING_FINISHED, MIN_CHUNK_SIZE, WORKERS_COUNT} from '~/constants';
import log from '@diplodoc/transform/lib/log';
import {Pool, Thread, Worker, spawn} from 'threads';
import {ProcessLinterWorker} from '~/workers/linter';
import {lintPage} from '~/resolvers';
import {extname} from 'path';

function connect(run: Run, linter: Worker) {
    return linter;
}

export async function handler(run: Run) {
    try {
        if (!run.config.lint.enabled) {
            return;
        }

        const workers = new Pool(
            async () => {
                return connect(run, await spawn(new Worker('./linter')));
            },
            {
                size: WORKERS_COUNT,
            },
        );

        run.toc.hooks.ItemResolved.tap((item, toc, path) => {
            if (own<string, 'href'>(item, 'href') && !isExternalHref(item.href)) {
                workers.queue(async (linter) => {
                    const result = await linter.process([item.href, path]);

                    run.logger.info(path, LINTING_FINISHED);

                    return result;
                });
            }
        });

        await run.toc.init();
        await workers.completed();
        await workers.terminate();

        /* Subscribe on the linted page event */
        // await workers.map(([worker]) => {
        //     worker.getProcessedPages().subscribe((pathToFile) => {
        //         logger.info(pathToFile as string, LINTING_FINISHED);
        //     });
        // });

        /* Run processing the linter */
        // await workers.map(([worker, chunk]) => {
        //     await worker.init(config, chunk);
        //     return run.start();
        // });
        //
        // /* Unsubscribe from workers */
        // await workers.map(([worker]) => {
        //     return worker.finish().then((logs) => {
        //         log.add(logs);
        //     });
        // });

        // await workers.terminate();
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}
