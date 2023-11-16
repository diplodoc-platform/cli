import 'threads/register';

import {Arguments} from 'yargs';
import {join, resolve} from 'path';
import {
    BUNDLE_FOLDER,
    LINT_CONFIG_FILENAME,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '../../constants';
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
import {copyFiles, logger} from '../../utils';
import {upload as publishFilesToS3} from '../publish/upload';
import glob from 'glob';

export async function handler(args: Arguments<any>) {
    const userOutputFolder = resolve(args.output);
    const tmpInputFolder = resolve(args.output, TMP_INPUT_FOLDER);
    const tmpOutputFolder = resolve(args.output, TMP_OUTPUT_FOLDER);

    try {
        ArgvService.init({
            ...args,
            rootInput: args.input,
            input: tmpInputFolder,
            output: tmpOutputFolder,
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
        const pathToConfig = args.config || join(args.input, YFM_CONFIG_FILENAME);
        const pathToLintConfig = join(args.input, LINT_CONFIG_FILENAME);

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
                    shell.cp(resolve(pathToConfig), tmpOutputFolder);
                    shell.cp(resolve(pathToLintConfig), tmpOutputFolder);

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
                        copyFiles(args.input, tmpOutputFolder, resourcePaths);
                    }

                    break;
                }
            }

            // Copy all generated files to user' output folder
            shell.cp(
                '-r',
                [join(tmpOutputFolder, '*'), join(tmpOutputFolder, '.*')],
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
    } catch (err) {
        logger.error('', err.message);
    } finally {
        processLogs(tmpInputFolder);

        shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
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
