import * as yargs from 'yargs';
import shell from 'shelljs';
import {resolve, join} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';
import log from 'yfm-transform/lib/log';

import {BUNDLE_FOLDER, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER, MAIN_TIMER_ID} from './constants';
import {
    processAssets,
    processExcludedFiles,
    processLogs,
    processPages,
    processServiceFiles,
} from './steps';
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
    .option('apply-presets', {
        default: true,
        describe: 'Should apply presets. Only for --output-format=md',
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
    .example('yfm-docs -i ./input -o ./output', '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .version(VERSION)
    .help();

console.time(MAIN_TIMER_ID);

const pathToConfig = _yargs.argv.config || join(_yargs.argv.input, '.yfm');
try {
    // Combine passed argv and properties from configuration file.
    const content = readFileSync(resolve(pathToConfig), 'utf8');
    _yargs.config(safeLoad(content) || {});
} catch (error) {
    if (error.name === 'YAMLException') {
        log.error(`Error to parse .yfm: ${error.message}`);
    }
}


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

processExcludedFiles();

processPages(tmpInputFolder, outputBundlePath);

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

/* Remove temporary folders */
shell.rm('-rf', tmpInputFolder, tmpOutputFolder);

processLogs(tmpInputFolder);
