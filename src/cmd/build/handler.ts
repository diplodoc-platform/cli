import 'threads/register';

import {Arguments} from 'yargs';
import {join, resolve} from 'path';
import {BUNDLE_FOLDER, LINT_CONFIG_FILENAME} from '../../constants';
import {ArgvService, Includers} from '../../services';
import OpenapiIncluder from '@diplodoc/openapi-extension/includer';
import {
    initLinterWorkers,
    processAssets,
    processExcludedFiles,
    processLinter,
    processLogs,
    processPages,
    processServiceFiles,
} from '../../steps';
import {prepareMapFile} from '../../steps/processMapFile';
import shell from 'shelljs';
import {Resources} from '../../models';
import {Run} from './index';
import {copyFiles} from '../../utils';
import {upload as publishFilesToS3} from '../publish/upload';
import glob from 'glob';

export async function handler(run: Run, args: Arguments<any>) {
    const userOutputFolder = resolve(run.config.output);

    try {
        ArgvService.init({
            ...run.config,
            rootInput: run.root,
            input: run.input,
            output: run.output,
        });
        Includers.init([OpenapiIncluder as any]);

        const {
            output: outputFolderPath,
            outputFormat,
            publish,
            lintDisabled,
            buildDisabled,
            addMapFile,
            allowCustomResources,
            resources,
        } = ArgvService.getConfig();

        preparingTemporaryFolders(userOutputFolder);

        await processServiceFiles();
        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const outputBundlePath = join(outputFolderPath, BUNDLE_FOLDER);
        const pathToLintConfig = join(run.root, LINT_CONFIG_FILENAME);

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
            switch (outputFormat) {
                case 'html':
                    processAssets(outputBundlePath);
                    break;
                case 'md': {
                    shell.cp(resolve(run.configPath), run.output);
                    shell.cp(resolve(pathToLintConfig), run.output);

                    if (resources && allowCustomResources) {
                        const resourcePaths: string[] = [];

                        // collect paths of all resources
                        Object.keys(resources).forEach(
                            (type) =>
                                resources[type as keyof Resources]?.forEach((path: string) =>
                                    resourcePaths.push(path),
                                ),
                        );

                        //copy resources
                        copyFiles(run.root, run.output, resourcePaths);
                    }

                    break;
                }
            }

            // Copy all generated files to user' output folder
            shell.cp(
                '-r',
                [join(run.output, '*'), join(run.output, '.*')],
                userOutputFolder,
            );

            if (publish) {
                const DEFAULT_PREFIX = process.env.YFM_STORAGE_PREFIX ?? '';
                const {
                    ignore = [],
                    storageRegion,
                    storageEndpoint: endpoint,
                    storageBucket: bucket,
                    storagePrefix: prefix = DEFAULT_PREFIX,
                    storageKeyId: accessKeyId,
                    storageSecretKey: secretAccessKey,
                } = ArgvService.getConfig();

                await publishFilesToS3({
                    input: userOutputFolder,
                    region: storageRegion,
                    ignore,
                    endpoint,
                    bucket,
                    prefix,
                    accessKeyId,
                    secretAccessKey,
                });
            }
        }
    } catch (error: any) {
        run.logger.error(error.message);
    } finally {
        processLogs(run.input);

        shell.rm('-rf', run.input, run.output);
    }
}

function preparingTemporaryFolders(userOutputFolder: string) {
    const args = ArgvService.getConfig();

    shell.mkdir('-p', userOutputFolder);

    // Create temporary input/output folders
    shell.rm('-rf', args.input, args.output);
    shell.mkdir(args.input, args.output);

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
