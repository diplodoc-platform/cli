import type {Run} from './run';

import 'threads/register';

import {join} from 'node:path';
import glob from 'glob';
import shell from 'shelljs';
import {ArgvService, Includers} from '~/services';
import {
    processAssets,
    processExcludedFiles,
    processLogs,
    processPages,
    processServiceFiles,
} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';
import {copyFiles} from '~/utils';

export async function handler(run: Run) {
    try {
        ArgvService.init({
            ...run.config,
            rootInput: run.originalInput,
            input: run.input,
            output: run.output,
        });
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        Includers.init();

        const {buildDisabled, addMapFile} = run.config;

        preparingTemporaryFolders(run);

        await processServiceFiles();
        await processExcludedFiles(run);

        if (addMapFile) {
            prepareMapFile();
        }

        if (!buildDisabled) {
            await processPages(run);
            processAssets(run);

            // Copy all generated files to user' output folder
            shell.cp('-r', [join(run.output, '*'), join(run.output, '.*')], run.originalOutput);
        }
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.log(error);
        run.logger.error(error.message);
    } finally {
        processLogs(run.input);

        shell.rm('-rf', run.input, run.output);
    }
}

function preparingTemporaryFolders(run: Run) {
    shell.mkdir('-p', run.originalOutput);

    // Create temporary input/output folders
    shell.rm('-rf', run.input, run.output);
    shell.mkdir(run.input, run.output);

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
