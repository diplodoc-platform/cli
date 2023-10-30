import {PluginService, TocService} from '../services';
import {getChunkSize} from '../utils/workers';
import {runPool} from './processPool';
import {chunk} from 'lodash';
import {lintPage} from '../resolvers';
import {extname} from 'path';
import {logger} from '../utils';
import {LINTING_FINISHED} from '../constants';

export async function processLinter(): Promise<void> {
    const navigationPaths = TocService.getNavigationPaths();

    if (process.env.DISABLE_PARALLEL_BUILD) {
        await lintPagesFallback(navigationPaths);
        return;
    }

    const navigationPathsChunks = chunk(navigationPaths, getChunkSize(navigationPaths));

    await Promise.all(
        navigationPathsChunks.map(async (navigationPathsChunk) => {
            await runPool('lint', navigationPathsChunk);
        }),
    );
}

async function lintPagesFallback(navigationPaths: string[]) {
    PluginService.setPlugins();

    await Promise.all(
        navigationPaths.map(async (pathToFile) => {
            await lintPage({
                inputPath: pathToFile,
                fileExtension: extname(pathToFile),
                onFinish: () => {
                    logger.info(pathToFile, LINTING_FINISHED);
                },
            });
        }),
    );
}
