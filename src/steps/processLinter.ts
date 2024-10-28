import log from '@diplodoc/transform/lib/log';
import {Thread, Worker, spawn} from 'threads';
import {extname} from 'path';

import {LINTING_FINISHED, MIN_CHUNK_SIZE, WORKERS_COUNT} from '~/constants';
import {ArgvService, PluginService, PresetService} from '~/services';
import {ProcessLinterWorker} from '~/workers/linter';
import {logger} from '~/utils';
import {lintPage} from '~/resolvers';
import {splitOnChunks} from '~/utils/worker';
import {RevisionContext} from '~/context/context';

let processLinterWorkers: (ProcessLinterWorker & Thread)[];
let filesToProcessChunks: string[][];

export async function processLinter(
    context: RevisionContext,
    filesToProcess: string[],
): Promise<void> {
    const argvConfig = ArgvService.getConfig();

    if (!processLinterWorkers) {
        await lintPagesFallback(filesToProcess, context);

        const {error} = log.get();

        if (error.length > 0) {
            throw Error('Linting the project has failed');
        }

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
            const navigationPathsChunk = filesToProcessChunks[i];

            return worker.run({
                argvConfig,
                presetStorage,
                navigationPaths: navigationPathsChunk,
                context,
            });
        }),
    );

    let isSuccess = true;

    /* Unsubscribe from workers */
    await Promise.all(
        processLinterWorkers.map((worker) => {
            return worker.finish().then((logs) => {
                if (logs.error?.length > 0) {
                    isSuccess = false;
                }

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

    if (!isSuccess) {
        throw Error('Linting the project has failed');
    }
}

export async function initLinterWorkers(filesToProcess: string[]) {
    const chunkSize = getChunkSize(filesToProcess);

    if (process.env.DISABLE_PARALLEL_BUILD || chunkSize < MIN_CHUNK_SIZE || WORKERS_COUNT <= 0) {
        return;
    }

    filesToProcessChunks = splitOnChunks(filesToProcess, chunkSize).filter((arr) => arr.length);

    const workersCount = filesToProcessChunks.length;

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

async function lintPagesFallback(filesToProcess: string[], context: RevisionContext) {
    PluginService.setPlugins();

    for (const pathToFile of filesToProcess) {
        await lintPage({
            inputPath: pathToFile,
            fileExtension: extname(pathToFile),
            onFinish: () => {
                logger.info(pathToFile, LINTING_FINISHED);
            },
            context,
        });
    }
}

export async function getLintFn(context: RevisionContext) {
    PluginService.setPlugins();

    return async (pathToFile: string) => {
        await lintPage({
            inputPath: pathToFile,
            fileExtension: extname(pathToFile),
            onFinish: () => {
                logger.info(pathToFile, LINTING_FINISHED);
            },
            context,
        });
    };
}
