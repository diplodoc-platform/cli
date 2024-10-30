import {Arguments, Argv} from 'yargs';
import {join, resolve} from 'path';
import shell from 'shelljs';
import glob from 'glob';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {BUNDLE_FOLDER, Stage, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from '~/constants';
import {argvValidator} from '~/validator';
import {Includer, YfmArgv} from '~/models';
import {ArgvService, Includers, SearchService, TocService} from '~/services';
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
import {copyFiles, logger} from '~/utils';
import {upload as publishFilesToS3} from '~/commands/publish/upload';
import {RevisionContext, makeRevisionContext} from '~/context/context';
import {FsContextCli} from '~/context/fs';

export const build = {
    command: ['build', '$0'],
    description: 'Build documentation in target directory',
    handler,
    builder,
};

function builder<T>(argv: Argv<T>) {
    return argv
        .option('input', {
            alias: 'i',
            describe: 'Path to input folder with .md files',
            type: 'string',
            group: 'Build options:',
        })
        .option('output', {
            alias: 'o',
            describe: 'Path to output folder',
            type: 'string',
            group: 'Build options:',
        })
        .option('varsPreset', {
            default: 'default',
            describe: 'Target vars preset of documentation <external|internal>',
            group: 'Build options:',
        })
        .option('output-format', {
            default: 'html',
            describe: 'Format of output file <html|md>',
            group: 'Build options:',
        })
        .option('vars', {
            alias: 'v',
            default: '{}',
            describe: 'List of markdown variables',
            group: 'Build options:',
        })
        .option('apply-presets', {
            default: true,
            describe: 'Should apply presets. Only for --output-format=md',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('resolve-conditions', {
            default: true,
            describe: 'Should resolve conditions. Only for --output-format=md',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('conditions-in-code', {
            default: false,
            describe: 'Meet conditions in code blocks',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('disable-liquid', {
            default: false,
            describe: 'Disable template engine',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('allowHTML', {
            default: false,
            describe: 'Allow to use HTML in Markdown files',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('ignore-stage', {
            default: Stage.SKIP,
            describe: 'Ignore tocs with stage',
            group: 'Build options:',
        })
        .option('ignore-author-patterns', {
            default: [] as string[],
            describe: 'Ignore authors if they contain passed string',
            group: 'Build options:',
            type: 'array',
        })
        .option('contributors', {
            default: false,
            describe: 'Should attach contributors into files',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('add-system-meta', {
            default: false,
            describe: 'Should add system section variables form presets into files meta data',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('add-map-file', {
            default: false,
            describe: 'Should add all paths of documentation into file.json',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('single-page', {
            default: false,
            describe: 'Beta functionality: Build a single page in the output folder also',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('publish', {
            default: false,
            describe: 'Should upload output files to S3 storage',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('remove-hidden-toc-items', {
            default: false,
            describe: 'Remove hidden toc items',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('lint-disabled', {
            default: false,
            describe: 'Disable linting',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('build-disabled', {
            default: false,
            describe: 'Disable building',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('allow-custom-resources', {
            default: false,
            describe: 'Allow loading custom resources',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('static-content', {
            default: false,
            describe: 'Include static content in the page',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('need-to-sanitize-html', {
            default: true,
            describe: 'Enable sanitize html',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('search', {})
        .check(argvValidator)
        .example('yfm -i ./input -o ./output', '')
        .demandOption(
            ['input', 'output'],
            'Please provide input and output arguments to work with this tool',
        );
}

async function handler(args: Arguments<YfmArgv>) {
    const userInputFolder = resolve(args.input);
    const userOutputFolder = resolve(args.output);
    const tmpInputFolder = resolve(args.output, TMP_INPUT_FOLDER);
    const tmpOutputFolder = resolve(args.output, TMP_OUTPUT_FOLDER);

    if (typeof VERSION !== 'undefined') {
        console.log(`Using v${VERSION} version`);
    }

    try {
        // Init singletone services
        ArgvService.init({
            ...args,
            rootInput: userInputFolder,
            input: tmpInputFolder,
            output: tmpOutputFolder,
        });
        SearchService.init();
        Includers.init([OpenapiIncluder as Includer]);

        const {
            output: outputFolderPath,
            outputFormat,
            publish,
            lintDisabled,
            buildDisabled,
            addMapFile,
        } = ArgvService.getConfig();

        const outputBundlePath = join(outputFolderPath, BUNDLE_FOLDER);

        // Create build context that stores the information about the current build
        const context = await makeRevisionContext(
            userInputFolder,
            userOutputFolder,
            tmpInputFolder,
            tmpOutputFolder,
            outputBundlePath,
        );

        const fs = new FsContextCli(context);

        // Creating temp .input & .output folder
        await preparingTemporaryFolders(context);

        // Read and prepare Preset & Toc data
        await processServiceFiles(context, fs);

        // Removes all content files that unspecified in toc files or ignored.
        await processExcludedFiles();

        // Write files.json
        if (addMapFile) {
            await prepareMapFile();
        }

        const navigationPaths = TocService.getNavigationPaths();

        // 1. Linting
        if (!lintDisabled) {
            /* Initialize workers in advance to avoid a timeout failure due to not receiving a message from them */
            await initLinterWorkers(navigationPaths);
        }

        const processes = [
            !lintDisabled && processLinter(context, navigationPaths),
            !buildDisabled && processPages(fs, outputBundlePath, context),
        ].filter(Boolean) as Promise<void>[];

        await Promise.all(processes);

        // 2. Building
        if (!buildDisabled) {
            // Process assets
            await processAssets({
                args,
                outputFormat,
                outputBundlePath,
                tmpOutputFolder,
                context,
                fs,
            });

            // Process changelogs
            await processChangelogs();

            // Finish search service processing
            await SearchService.release();

            // Copy all generated files to user' output folder
            shell.cp('-r', join(tmpOutputFolder, '*'), userOutputFolder);
            if (glob.sync('.*', {cwd: tmpOutputFolder}).length) {
                shell.cp('-r', join(tmpOutputFolder, '.*'), userOutputFolder);
            }

            // Upload the files to S3
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
                    ignore: [...ignore, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER],
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
        // Print logs
        processLogs(tmpInputFolder);

        shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
    }
}

// Creating temp .input & .output folder
async function preparingTemporaryFolders(context: RevisionContext) {
    shell.mkdir('-p', context.userOutputFolder);

    // Create temporary input/output folders
    shell.rm('-rf', context.tmpInputFolder, context.tmpOutputFolder);
    shell.mkdir(context.tmpInputFolder, context.tmpOutputFolder);

    await copyFiles(context.userInputFolder, context.tmpInputFolder, context.files);

    shell.chmod('-R', 'u+w', context.tmpInputFolder);
}
