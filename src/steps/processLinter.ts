import type {Run} from '~/commands/build';

import log from '@diplodoc/transform/lib/log';
import {Thread, Worker, spawn} from 'threads';
import {extname} from 'path';

import {ArgvService, PluginService, PresetService} from '../services';
import {ProcessLinterWorker} from '../workers/linter';
import {logger} from '../utils';
import {LINTING_FINISHED, MIN_CHUNK_SIZE, WORKERS_COUNT} from '../constants';
import {lintPage} from '../resolvers';
import {splitOnChunks} from '../utils/worker';

let processLinterWorkers: (ProcessLinterWorker & Thread)[];
let navigationPathsChunks: string[][];

export async function processLinter(run: Run): Promise<void> {
    if (!run.config.lint.enabled) {
        return;
    }

    await initLinterWorkers(run);

    const argvConfig = ArgvService.getConfig();

    const navigationPaths = run.toc.entries;

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

export async function initLinterWorkers(run: Run) {
    const navigationPaths = run.toc.entries;
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
