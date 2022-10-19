import yargs, {Arguments} from 'yargs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import 'threads/register';

import {
    BUNDLE_FOLDER,
    TMP_INPUT_FOLDER,
    TMP_OUTPUT_FOLDER,
    MAIN_TIMER_ID,
    REDIRECTS_FILENAME,
    LINT_CONFIG_FILENAME,
    YFM_CONFIG_FILENAME,
    Stage,
} from './constants';

import {xliff, translate} from './cmd';
import {
    processAssets,
    processExcludedFiles,
    processLogs,
    processPages,
    processLinter,
    initLinterWorkers,
    processServiceFiles,
    publishFilesToS3,
} from './steps';
import {ArgvService, Includers} from './services';
import {argvValidator} from './validator';
import {prepareMapFile} from './steps/processMapFile';
import {copyFiles} from './utils';
import {Resources} from './models';

console.time(MAIN_TIMER_ID);

yargs
    .option('config', {
        alias: 'c',
        describe: 'YFM configuration file',
        type: 'string',
    })
    .option('input', {
        alias: 'i',
        describe: 'Path to input folder with .md files',
        type: 'string',
    })
    .option('output', {
        alias: 'o',
        describe: 'Path to output folder',
        type: 'string',
    })
    .option('varsPreset', {
        default: 'default',
        describe: 'Target vars preset of documentation <external|internal>',
    })
    .option('output-format', {
        default: 'html',
        describe: 'Format of output file <html|md>',
    })
    .option('vars', {
        alias: 'v',
        default: '{}',
        describe: 'List of markdown variables',
    })
    .option('apply-presets', {
        default: true,
        describe: 'Should apply presets. Only for --output-format=md',
        type: 'boolean',
    })
    .option('resolve-conditions', {
        default: true,
        describe: 'Should resolve conditions. Only for --output-format=md',
        type: 'boolean',
    })
    .option('disable-liquid', {
        default: false,
        describe: 'Disable template engine',
        type: 'boolean',
    })
    .option('strict', {
        alias: 's',
        default: false,
        describe: 'Run in strict mode',
        type: 'boolean',
    })
    .option('allowHTML', {
        default: false,
        describe: 'Allow to use HTML in Markdown files',
        type: 'boolean',
    })
    .option('ignore-stage', {
        default: Stage.SKIP,
        describe: 'Ignore tocs with stage',
    })
    .option('contributors', {
        default: false,
        describe: 'Should attach contributors into files',
        type: 'boolean',
    })
    .option('add-system-meta', {
        default: false,
        describe: 'Should add system section variables form presets into files meta data',
        type: 'boolean',
    })
    .option('add-map-file', {
        default: false,
        describe: 'Should add all paths of documentation into file.json',
        type: 'boolean',
    })
    .option('quiet', {
        alias: 'q',
        default: false,
        describe: 'Run in quiet mode. Don\'t write logs to stdout',
        type: 'boolean',
    })
    .option('single-page', {
        default: false,
        describe: 'Beta functionality: Build a single page in the output folder also',
        type: 'boolean',
    })
    .option('publish', {
        default: false,
        describe: 'Should upload output files to S3 storage',
        type: 'boolean',
    })
    .option('remove-hidden-toc-items', {
        default: false,
        describe: 'Remove hidden toc items',
        type: 'boolean',
    })
    .option('lint-disabled', {
        default: false,
        describe: 'Disable linting',
        type: 'boolean',
    })
    .option('build-disabled', {
        default: false,
        describe: 'Disable building',
        type: 'boolean',
    })
    .option('allow-custom-resources', {
        default: false,
        describe: 'Allow loading custom resources',
        type: 'boolean',
    })
    .check(argvValidator)
    .example('yfm -i ./input -o ./output', '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .command(xliff)
    .command(translate)
    .command('$0', 'the default command', () => {}, main)
    .version(VERSION)
    .help()
    .parse()
;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function main(args: Arguments<any>) {
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
        Includers.init();

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

        preparingTemporaryFolders(args, userOutputFolder, tmpInputFolder, tmpOutputFolder);

        await processServiceFiles();
        processExcludedFiles();

        if (addMapFile) {
            prepareMapFile();
        }

        const outputBundlePath: string = join(outputFolderPath, BUNDLE_FOLDER);
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
                await publishFilesToS3();
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        processLogs(tmpInputFolder);

        shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
    }
}

function preparingTemporaryFolders(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    args: Arguments<any>,
    userOutputFolder: string,
    tmpInputFolder: string,
    tmpOutputFolder: string) {

    shell.mkdir('-p', userOutputFolder);

    // Create temporary input/output folders
    shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
    shell.mkdir(tmpInputFolder, tmpOutputFolder);

    // Copy all user' files to the temporary folder to avoid user' file changing.
    // Please, change files only in temporary folders.
    shell.cp('-rL', resolve(args.input, '*'), tmpInputFolder);
    shell.chmod('-R', 'u+w', tmpInputFolder);
}
