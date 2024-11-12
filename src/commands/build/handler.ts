import type {Run} from './run';

import 'threads/register';

import glob from 'glob';
import {join} from 'path';
import shell from 'shelljs';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {BUNDLE_FOLDER} from '~/constants';
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
    const tmpInputFolder = run.input;
    const tmpOutputFolder = run.output;

    if (typeof VERSION !== 'undefined') {
        console.log(`Using v${VERSION} version`);
    }

    try {
        ArgvService.init(run.legacyConfig);
        SearchService.init();
        // TODO: Remove duplicated types from openapi-extension
        // @ts-ignore
        Includers.init([OpenapiIncluder]);

        const {
            output: outputFolderPath,
            outputFormat,
            lintDisabled,
            buildDisabled,
            addMapFile,
        } = ArgvService.getConfig();

        preparingTemporaryFolders();

        await processServiceFiles();
        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const outputBundlePath = join(outputFolderPath, BUNDLE_FOLDER);

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
            processAssets({
                run,
                outputFormat,
                outputBundlePath,
                tmpOutputFolder,
            });

            await processChangelogs();

            await SearchService.release();
        }
    } catch (error) {
        run.logger.error(error);
    } finally {
        processLogs(tmpInputFolder);
    }
}

function preparingTemporaryFolders() {
    const args = ArgvService.getConfig();

    copyFiles(
        args.rootInput,
        args.input,
        glob.sync('**', {
            cwd: args.rootInput,
            nodir: true,
            follow: true,
            ignore: ['node_modules/**', '*/node_modules/**'],
        }),
    );

    shell.chmod('-R', 'u+w', args.input);
}
