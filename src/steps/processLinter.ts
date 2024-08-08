import log from '@diplodoc/transform/lib/log';
import {Thread, Worker, spawn} from 'threads';
import {extname} from 'path';

import {LINTING_FINISHED, MIN_CHUNK_SIZE, WORKERS_COUNT} from '~/constants';
import {ArgvService, PluginService, PresetService, TocService} from '~/services';
import {ProcessLinterWorker} from '~/workers/linter';
import {logger} from '~/utils';
import {lintPage} from '~/resolvers';
import {splitOnChunks} from '~/utils/worker';
import {RevisionContext} from '~/context/context';

let processLinterWorkers: (ProcessLinterWorker & Thread)[];
let navigationPathsChunks: string[][];

export async function processLinter(context: RevisionContext): Promise<void> {
    const argvConfig = ArgvService.getConfig();

    const navigationPaths = TocService.getNavigationPaths();

    if (!processLinterWorkers) {
        lintPagesFallback(navigationPaths, context);

        return;
    }

    const presetStorage = PresetService.getPresetStorage();

    /* Subscribe on the linted page event */
    processLinterWorkers.forEach((worker) => {
        worker.getProcessedPages().subscribe((pathToFile) => {
            logger.info(pathToFile as string, LINTING_FINISHED);
        });
    });

    /* Run processing the linter */
    await Promise.all(
        processLinterWorkers.map((worker, i) => {
            const navigationPathsChunk = navigationPathsChunks[i];

            return worker.run({
                argvConfig,
                presetStorage,
                navigationPaths: navigationPathsChunk,
                context,
            });
        }),
    );

    /* Unsubscribe from workers */
    await Promise.all(
        processLinterWorkers.map((worker) => {
            return worker.finish().then((logs) => {
                log.add(logs);
            });
        }),
    );

    /* Terminate workers */
    await Promise.all(
        processLinterWorkers.map((worker) => {
            return Thread.terminate(worker);
        }),
    );
}

export async function initLinterWorkers() {
    const navigationPaths = TocService.getNavigationPaths();
    const chunkSize = getChunkSize(navigationPaths);

    if (process.env.DISABLE_PARALLEL_BUILD || chunkSize < MIN_CHUNK_SIZE || WORKERS_COUNT <= 0) {
        return;
    }

    navigationPathsChunks = splitOnChunks(navigationPaths, chunkSize).filter((arr) => arr.length);

    const workersCount = navigationPathsChunks.length;

    processLinterWorkers = await Promise.all(
        new Array(workersCount).fill(null).map(() => {
            // TODO: get linter path from env
            return spawn<ProcessLinterWorker>(new Worker('./linter'), {timeout: 60000});
        }),
    );
}

function getChunkSize(arr: string[]) {
    return Math.ceil(arr.length / WORKERS_COUNT);
}

function lintPagesFallback(navigationPaths: string[], context: RevisionContext) {
    PluginService.setPlugins();

    navigationPaths.forEach((pathToFile) => {
        if (!context.meta?.files?.[pathToFile]?.changed) {
            return;
        }
        lintPage({
            inputPath: pathToFile,
            fileExtension: extname(pathToFile),
            onFinish: () => {
                logger.info(pathToFile, LINTING_FINISHED);
            },
            context,
        });
    });
}
