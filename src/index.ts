import * as yargs from 'yargs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import * as dotEnv from 'dotenv';

import {BUNDLE_FOLDER, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER, MAIN_TIMER_ID, Stage} from './constants';
import {
    processAssets,
    processExcludedFiles,
    processLogs,
    processPages,
    processServiceFiles,
    publishFiles,
} from './steps';
import {ArgvService} from './services';
import {argvValidator} from './validator';
import {getClient} from './client/client';

const dotEnvPath = resolve(process.cwd(), '.env');
dotEnv.config({path: dotEnvPath});

const _yargs = yargs
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
        describe: 'Should add contributors into files',
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
    .check(argvValidator)
    .example('yfm -i ./input -o ./output', '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .version(VERSION)
    .help();

console.time(MAIN_TIMER_ID);

const pathToConfig = _yargs.argv.config || join(_yargs.argv.input, '.yfm');

/* Create user' output folder if doesn't exists */
const userOutputFolder = resolve(_yargs.argv.output);
shell.mkdir('-p', userOutputFolder);

/* Create temporary input/output folders */
const tmpInputFolder = resolve(_yargs.argv.output, TMP_INPUT_FOLDER);
const tmpOutputFolder = resolve(_yargs.argv.output, TMP_OUTPUT_FOLDER);
shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
shell.mkdir(tmpInputFolder, tmpOutputFolder);

/*
 * Copy all user' files to the temporary folder to avoid user' file changing.
 * Please, change files only in temporary folders.
 */
shell.cp('-r', resolve(_yargs.argv.input, '*'), tmpInputFolder);
shell.chmod('-R', 'u+w', tmpInputFolder);

ArgvService.init({
    ..._yargs.argv,
    input: tmpInputFolder,
    output: tmpOutputFolder,
});

const {
    output: outputFolderPath,
    outputFormat,
    publish,
} = ArgvService.getConfig();

const outputBundlePath: string = join(outputFolderPath, BUNDLE_FOLDER);

processServiceFiles();

processExcludedFiles();

async function asyncProcess() {
    const client = getClient(_yargs.argv.input, pathToConfig);
    await processPages(tmpInputFolder, outputBundlePath, client);

    /* Should copy all assets only when running --output-format=html */
    if (outputFormat === 'html') {
        processAssets(outputBundlePath);
    }

    /* Copy all generated files to user' output folder */
    shell.cp('-r', join(tmpOutputFolder, '*'), userOutputFolder);

    /* Copy configuration file */
    if (outputFormat === 'md') {
        shell.cp('-r', resolve(pathToConfig), userOutputFolder);
    }

    /* Upload output files to S3 storage */
    if (publish) {
        publishFiles();
    }

    /* Remove temporary folders */
    shell.rm('-rf', tmpInputFolder, tmpOutputFolder);

    processLogs(tmpInputFolder);
}

asyncProcess();

export { };
