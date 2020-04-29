import * as yargs from 'yargs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {BUNDLE_FOLDER, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER, MAIN_TIMER_ID} from './constants';
import {processAssets, processPages, processServiceFiles, processLogs} from './steps';
import {ArgvService} from './services';

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
    .option('strict', {
        alias: 's',
        default: false,
        describe: 'Run in strict mode',
        type: 'boolean',
    })
    .example('yfm-docs -i ./input -o ./output', '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .help();

console.time(MAIN_TIMER_ID);

try {
    // Combine passed argv and properties from configuration file.
    const pathToConfig = _yargs.argv.config || join(_yargs.argv.input, '.yfm');
    const content = readFileSync(resolve(pathToConfig), 'utf8');
    _yargs.config(safeLoad(content) || {});
} catch {}


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

ArgvService.init({
    ..._yargs.argv,
    input: tmpInputFolder,
    output: tmpOutputFolder,
});

const {
    output: outputFolderPath,
    outputFormat,
} = ArgvService.getConfig();

const outputBundlePath: string = join(outputFolderPath, BUNDLE_FOLDER);

processServiceFiles();

processPages(tmpInputFolder, outputBundlePath);

/* Should copy all assets only when running --output-format=html */
if (outputFormat === 'html') {
    processAssets(outputBundlePath);
}

/* Copy all generated files to user' output folder */
shell.cp('-r', join(tmpOutputFolder, '*'), userOutputFolder);

/* Remove temporary folders */
shell.rm('-rf', tmpInputFolder, tmpOutputFolder);

processLogs(tmpInputFolder);
