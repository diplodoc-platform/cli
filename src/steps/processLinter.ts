import log from '@doc-tools/transform/lib/log';
import {spawn, Worker, Thread} from 'threads';
import {extname} from 'path';

import {ArgvService, TocService, PresetService, PluginService} from '../services';
import {ProcessLinterWorker} from '../workers/processLinter';
import {logger} from '../utils';
import {LINTING_FINISHED, WORKERS_COUNT, MIN_CHUNK_SIZE} from '../constants';
import {lintPage} from '../resolvers';
import {splitOnChunks} from '../utils/worker';

let processLinterWorkers: (ProcessLinterWorker & Thread)[];
let navigationPathsChunks: (string[])[];

export async function processLinter(): Promise<void> {
    const argvConfig = ArgvService.getConfig();

    const navigationPaths = TocService.getNavigationPaths();

    if (!processLinterWorkers) {
        lintPagesFallback(navigationPaths);

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

    navigationPathsChunks = splitOnChunks(navigationPaths, chunkSize)
        .filter((arr) => arr.length);

    const workersCount = navigationPathsChunks.length;

    processLinterWorkers = await Promise.all((new Array(workersCount)).fill(null).map(() => {
        return spawn<ProcessLinterWorker>(new Worker('../workers/processLinter/worker'), {timeout: 60000});
    }));
}

function getChunkSize(arr: string[]) {
    return Math.ceil(arr.length / WORKERS_COUNT);
}

function lintPagesFallback(navigationPaths: string[]) {
    PluginService.setPlugins();

    navigationPaths.forEach((pathToFile) => {
        lintPage({
            inputPath: pathToFile,
            fileExtension: extname(pathToFile),
            onFinish: () => {
                logger.info(pathToFile, LINTING_FINISHED);
            },
        });
    });
}
