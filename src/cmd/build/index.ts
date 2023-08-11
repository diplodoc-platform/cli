import {Arguments, Argv} from 'yargs';
import {
    BUNDLE_FOLDER, LINT_CONFIG_FILENAME,
    REDIRECTS_FILENAME,
    Stage,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    YFM_CONFIG_FILENAME,
} from '../../constants';
import {argvValidator} from '../../validator';
import {join, resolve} from 'path';
import {ArgvService, Includers} from '../../services';
import OpenapiIncluder from '@diplodoc/openapi-extension/includer';
import {
    initLinterWorkers,
    processAssets,
    processExcludedFiles,
    processLinter, processLogs,
    processPages,
    processServiceFiles,
} from '../../steps';
import {prepareMapFile} from '../../steps/processMapFile';
import shell from 'shelljs';
import {Resources} from '../../models';
import {copyFiles, logger} from '../../utils';
import {upload as publishFilesToS3} from '../publish/upload';
import glob from 'glob';

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
        .check(argvValidator)
        .example('yfm -i ./input -o ./output', '')
        .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool');
}

async function handler(args: Arguments<any>) {
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
        const pathToRedirects = join(args.input, REDIRECTS_FILENAME);
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
                    shell.cp(resolve(pathToRedirects), tmpOutputFolder);
                    shell.cp(resolve(pathToLintConfig), tmpOutputFolder);

                    if (resources && allowCustomResources) {
                        const resourcePaths: string[] = [];

                        // collect paths of all resources
                        Object.keys(resources).forEach((type) =>
                            resources[type as keyof Resources]?.forEach((path: string) => resourcePaths.push(path)));

                        //copy resources
                        copyFiles(args.input, tmpOutputFolder, resourcePaths);
                    }

                    break;
                }
            }

            // Copy all generated files to user' output folder
            shell.cp('-r', [join(tmpOutputFolder, '*'), join(tmpOutputFolder, '.*')], userOutputFolder);

            if (publish) {
                const DEFAULT_PREFIX = process.env.YFM_STORAGE_PREFIX ?? '';
                const {
                    ignore = [],
                    storageEndpoint: endpoint,
                    storageBucket: bucket,
                    storagePrefix: prefix = DEFAULT_PREFIX,
                    storageKeyId: accessKeyId,
                    storageSecretKey: secretAccessKey,
                } = ArgvService.getConfig();
                await publishFilesToS3({
                    input: userOutputFolder,
                    ignore,
                    endpoint,
                    bucket,
                    prefix,
                    accessKeyId,
                    secretAccessKey,
                });
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            logger.error('', error.message);
        }
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
    shell.chmod('-R', 'u+w', args.input);

    copyFiles(args.rootInput, args.input, glob.sync('**', {
        cwd: args.rootInput,
        nodir: true,
        follow: true,
        ignore: [
            'node_modules/**',
            '*/node_modules/**',
        ],
    }));
}
