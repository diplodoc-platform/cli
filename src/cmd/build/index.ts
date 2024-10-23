import {Arguments, Argv} from 'yargs';
import {join, resolve} from 'path';
import shell from 'shelljs';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {BUNDLE_FOLDER, Stage, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from '~/constants';
import {argvValidator} from '~/validator';
import {ArgvService, Includers, SearchService, TocService} from '~/services';
import {
    finishProcessPages,
    getLintFn,
    getProcessPageFn,
    processAssets,
    processChangelogs,
    processExcludedFiles,
    processLogs,
    processServiceFiles,
} from '~/steps';
import {prepareMapFile} from '~/steps/processMapFile';
import {copyFiles, logger} from '~/utils';
import {upload as publishFilesToS3} from '~/commands/publish/upload';
import {RevisionContext, makeRevisionContext, setRevisionContext} from '~/context/context';
import {FsContextCli} from '~/context/fs';
import {DependencyContextCli} from '~/context/dependency';
import {FileQueueProcessor} from '~/context/processor';

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
        .option('debug', {
            alias: 'd',
            describe: 'Debug mode for development',
            type: 'string',
            group: 'Build options:',
        })
        .option('output', {
            alias: 'o',
            describe: 'Path to output folder',
            type: 'string',
            group: 'Build options:',
        })
        .option('plugins', {
            alias: 'p',
            describe: 'Path to plugins js file',
            type: 'string',
            group: 'Build options:',
        })
        .option('cached', {
            default: false,
            describe: 'Use cache from revision meta file',
            type: 'boolean',
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

async function handler(args: Arguments<any>) {
    let hasError = false;

    const userOutputFolder = resolve(args.output);
    const tmpInputFolder = resolve(args.output, TMP_INPUT_FOLDER);
    const tmpOutputFolder = resolve(args.output, TMP_OUTPUT_FOLDER);

    if (typeof VERSION !== 'undefined') {
        console.log(`Using v${VERSION} version`);
    }

    try {
        ArgvService.init({
            ...args,
            rootInput: args.input,
            input: tmpInputFolder,
            output: tmpOutputFolder,
        });
        SearchService.init();
        Includers.init([OpenapiIncluder as any]);

        const {
            output: outputFolderPath,
            outputFormat,
            publish,
            lintDisabled,
            buildDisabled,
            addMapFile,
        } = ArgvService.getConfig();

        const outputBundlePath = join(outputFolderPath, BUNDLE_FOLDER);

        const context = await makeRevisionContext(
            userOutputFolder,
            tmpInputFolder,
            tmpOutputFolder,
            outputBundlePath,
        );

        const fs = new FsContextCli(context);
        const deps = new DependencyContextCli(context);
        const pageProcessor = new FileQueueProcessor(context, deps);
        const pageLintProcessor = new FileQueueProcessor(context, deps);

        await preparingTemporaryFolders(context);
        await processServiceFiles(context, fs);
        await processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const navigationPaths = TocService.getNavigationPaths();

        pageProcessor.setNavigationPaths(navigationPaths);
        pageLintProcessor.setNavigationPaths(navigationPaths);

        if (!lintDisabled) {
            const filesToProcess = pageLintProcessor.getFilesToProcess();

            const processLintPageFn = await getLintFn(context);

            await pageLintProcessor.processQueue(processLintPageFn, filesToProcess);
        }

        if (!buildDisabled) {
            const filesToProcess = pageProcessor.getFilesToProcess();

            const processPageFn = await getProcessPageFn(fs, deps, context, outputBundlePath);

            await pageProcessor.processQueue(processPageFn, filesToProcess);

            await finishProcessPages(fs);
        }

        if (!buildDisabled) {
            // process additional files
            await processAssets({
                args,
                outputFormat,
                outputBundlePath,
                tmpOutputFolder,
                userOutputFolder,
                context,
                fs,
            });

            await processChangelogs();

            await SearchService.release();

            // Copy all generated files to user' output folder
            shell.cp('-r', join(tmpOutputFolder, '*'), userOutputFolder);
            if (glob.sync('.*', {cwd: tmpOutputFolder}).length) {
                shell.cp('-r', join(tmpOutputFolder, '.*'), userOutputFolder);
            }

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

        await setRevisionContext(context);
    } catch (err) {
        if (args.debug) {
            console.error(err);
        }

        logger.error('', err.message);

        hasError = true;
    } finally {
        processLogs(tmpInputFolder);

        shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
    }

    if (hasError) {
        process.exit(1);
    }
}

async function preparingTemporaryFolders(revisionContext: RevisionContext) {
    const args = ArgvService.getConfig();

    shell.mkdir('-p', revisionContext.userOutputFolder);

    // Create temporary input/output folders
    shell.rm('-rf', args.input, args.output);
    shell.mkdir(args.input, args.output);

    await copyFiles(args.rootInput, args.input, revisionContext.files, revisionContext.meta);

    shell.chmod('-R', 'u+w', args.input);
}
