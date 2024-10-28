import {Arguments, Argv} from 'yargs';
import {join, resolve} from 'path';
import shell from 'shelljs';
import glob from 'glob';
import liveServer from 'live-server';
import chokidar from 'chokidar';
import debounce from 'lodash/debounce';

import OpenapiIncluder from '@diplodoc/openapi-extension/includer';

import {BUNDLE_FOLDER, Stage, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from '~/constants';
import {argvValidator} from '~/validator';
import {Includer, YfmArgv} from '~/models';
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
        .option('clean', {
            default: false,
            describe: 'Remove output folder before build',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('dev', {
            default: false,
            describe: 'Enable watch with http server',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('host', {
            default: '0.0.0.0',
            describe: 'Host for dev server (Default is 0.0.0.0)',
            type: 'boolean',
            group: 'Build options:',
        })
        .option('port', {
            default: 5000,
            describe: 'Port for dev server (Default is 5000)',
            type: 'number',
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

let isCompiling = false;
let needToCompile = false;

const runCompile = debounce(async (init: boolean) => {
    if (isCompiling) {
        needToCompile = true;
    } else {
        isCompiling = true;
        needToCompile = false;

        try {
            await compile(init);
        } catch (error) {
            //
        }

        isCompiling = false;

        if (needToCompile) {
            runCompile(false);
        }
    }
}, 1000);

let args: Arguments<YfmArgv>;

async function handler(initArgs: Arguments<YfmArgv>) {
    args = initArgs;

    if (args.dev) {
        chokidar
            .watch(resolve(args.input), {
                ignored: (path) => path.includes('.tmp_'),
                persistent: true,
                followSymlinks: true,
                awaitWriteFinish: true,
            })
            .on('raw', () => runCompile(false));

        const params = {
            port: args.port ?? 5000,
            host: args.host ?? '0.0.0.0',
            root: resolve(args.output),
            open: false,
            wait: 1000,
            logLevel: 0,
        };

        liveServer.start(params);

        runCompile(true);

        return await new Promise(() => null);
    } else {
        return await compile(true);
    }
}

async function compile(init: boolean) {
    if (typeof VERSION !== 'undefined') {
        console.log(`Using v${VERSION} version`);
    }

    shell.config.silent = true;

    let hasError = false;

    const userInputFolder = resolve(args.input);
    const userOutputFolder = resolve(args.output);
    const tmpInputFolder = resolve(args.output, TMP_INPUT_FOLDER);
    const tmpOutputFolder = resolve(args.output, TMP_OUTPUT_FOLDER);

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

        if (init && args.clean) {
            await clearTemporaryFolders(userOutputFolder);
        }

        // Create build context that stores the information about the current build
        const context = await makeRevisionContext(
            args.cached,
            userInputFolder,
            userOutputFolder,
            tmpInputFolder,
            tmpOutputFolder,
            outputBundlePath,
        );

        const fs = new FsContextCli(context);
        const deps = new DependencyContextCli(context);

        // Creating temp .input & .output folder
        await preparingTemporaryFolders(context);

        // Read and prepare Preset & Toc data
        await processServiceFiles(context, fs);

        // Removes all content files that unspecified in toc files or ignored.
        await processExcludedFiles();

        // Write files.json
        if (addMapFile) {
            prepareMapFile();
        }

        // Collect navigation paths as entry files
        const navigationPaths = TocService.getNavigationPaths();

        // 1. Linting
        if (!lintDisabled) {
            const pageLintProcessor = new FileQueueProcessor(context, deps);
            pageLintProcessor.setNavigationPaths(navigationPaths);

            const processLintPageFn = await getLintFn(context);
            await pageLintProcessor.processQueue(processLintPageFn);
        }

        // 2. Building
        if (!buildDisabled) {
            const pageProcessor = new FileQueueProcessor(context, deps);
            pageProcessor.setNavigationPaths(navigationPaths);

            const processPageFn = await getProcessPageFn(fs, deps, context, outputBundlePath);
            await pageProcessor.processQueue(processPageFn);

            // Save single pages & redirects
            await finishProcessPages(fs);

            // Process asset files
            await processAssets({
                args,
                outputFormat,
                outputBundlePath,
                tmpOutputFolder,
                userOutputFolder,
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

            // Save .revision.meta.json file for the future processing
            await setRevisionContext(context);
        }
    } catch (err) {
        logger.error('', err.message);

        hasError = true;
    } finally {
        // Print logs
        processLogs(tmpInputFolder);

        shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
    }

    // If build has some errors, then exit with error code 1
    if (hasError) {
        process.exit(1);
    }
}

// Creating temp .input & .output folder
async function preparingTemporaryFolders(revisionContext: RevisionContext) {
    shell.mkdir('-p', revisionContext.userOutputFolder);

    // Create temporary input/output folders
    shell.rm('-rf', revisionContext.tmpInputFolder, revisionContext.tmpOutputFolder);
    shell.mkdir(revisionContext.tmpInputFolder, revisionContext.tmpOutputFolder);

    await copyFiles(
        revisionContext.userInputFolder,
        revisionContext.tmpInputFolder,
        revisionContext.files,
        revisionContext.meta,
    );

    shell.chmod('-R', 'u+w', revisionContext.tmpInputFolder);
}

// Clear output folder folders
async function clearTemporaryFolders(userOutputFolder: string) {
    shell.rm('-rf', userOutputFolder);
}