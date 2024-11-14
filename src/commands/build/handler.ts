import type {Run} from './run';

import 'threads/register';

import glob from 'glob';
import shell from 'shelljs';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {ArgvService, Includers, SearchService} from '~/services';
import {
    initLinterWorkers,
    processAssets,
    processChangelogs,
    processExcludedFiles,
    processLinter,
    processLogs,
    processPages,
    processServiceFiles,
} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';
import {copyFiles} from '~/utils';

export async function handler(run: Run) {
    if (typeof VERSION !== 'undefined') {
        console.log(`Using v${VERSION} version`);
    }

    try {
        ArgvService.init(run.legacyConfig);
        SearchService.init();
        // TODO: Remove duplicated types from openapi-extension
        // @ts-ignore
        Includers.init([OpenapiIncluder]);

        const {lintDisabled, buildDisabled, addMapFile} = ArgvService.getConfig();

        preparingTemporaryFolders(run);

        await processServiceFiles();
        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const outputBundlePath = run.bundlePath;

        if (!lintDisabled) {
            /* Initialize workers in advance to avoid a timeout failure due to not receiving a message from them */
            await initLinterWorkers();
        }

        const processes = [
            !lintDisabled && processLinter(),
            !buildDisabled && processPages(outputBundlePath),
        ].filter(Boolean) as Promise<void>[];

        await Promise.all(processes);

        if (!buildDisabled) {
            // process additional files
            processAssets(run);

            await processChangelogs();

            await SearchService.release();
        }
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(run.input);
    }
}

function preparingTemporaryFolders(run: Run) {
    copyFiles(
        run.originalInput,
        run.input,
        glob.sync('**', {
            cwd: run.originalInput,
            nodir: true,
            follow: true,
            ignore: ['node_modules/**', '*/node_modules/**'],
        }),
    );

    shell.chmod('-R', 'u+w', run.input);
}
