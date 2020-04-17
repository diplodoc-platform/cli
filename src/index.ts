import * as yargs from 'yargs';
import shell from 'shelljs';
import walkSync from 'walk-sync';
import {extname, resolve, basename, dirname, join} from 'path';
import {writeFileSync, copyFileSync, readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {TocService, PresetService, ArgvService} from './services';
import {resolveMd2Md, resolveMd2HTML} from './utils';
import {BUNDLE_FILENAME, BUNDLE_FOLDER, TMP_INPUT_FOLDER, TMP_OUTPUT_FOLDER} from './constants';

const BUILD_FOLDER_PATH = dirname(process.mainModule?.filename || '');

const _yargs = yargs
    .option('config', {
        alias: 'c',
        default: join(BUILD_FOLDER_PATH, '.yfm'),
        describe: 'YFM configuration file',
    })
    .option('input', {
        alias: 'i',
        describe: 'Path to input folder with .md files',
        type: 'string'
    })
    .option('output', {
        alias: 'o',
        describe: 'Path to output folder',
        type: 'string'
    })
    .option('audience', {
        alias: 'a',
        default: 'external',
        describe: 'Target audience of documentation <external|internal>'
    })
    .option('output-format', {
        default: 'html',
        describe: 'Format of output file <html|md>'
    })
    .option('vars', {
        alias: 'v',
        default: '{}',
        describe: 'List of markdown variables',
    })
    .option('plugins', {
        alias: 'p',
        describe: 'List of yfm-transform plugins'
    })
    .option('ignore', {
        default: [],
        describe: 'List of toc and preset files that should be ignored'
    })
    .example(`yfm-docs -i ./input -o ./output`, '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .help();

try {
    // Combine passed argv and properties from configuration file.
    const content = readFileSync(resolve(_yargs.argv.config), 'utf8');
    _yargs.config(safeLoad(content) || {});
} catch {
    console.warn('.yfm configuration file wasn\'t provided');
}

/* Create temporary input/output folders */
const tmpInputFolder = resolve(BUILD_FOLDER_PATH, TMP_INPUT_FOLDER);
const tmpOutputFolder = resolve(BUILD_FOLDER_PATH, TMP_OUTPUT_FOLDER);
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
    output: tmpOutputFolder
});

const {
    input: inputFolderPath,
    output: outputFolderPath,
    outputFormat,
    audience = '',
    ignore = [],
} = ArgvService.getConfig();

const outputBundlePath: string = join(outputFolderPath, BUNDLE_FOLDER);

const serviceFilePaths: string[] = walkSync(inputFolderPath, {
    directories: false,
    includeBasePath: false,
    globs: [
        '**/toc.yaml',
        '**/presets.yaml',
    ],
    ignore,
});

for (const path of serviceFilePaths) {
    const fileExtension: string = extname(path);
    const fileBaseName: string = basename(path, fileExtension);

    if (fileBaseName === 'presets') {
        PresetService.add(path, audience);
    }

    if (fileBaseName === 'toc') {
        TocService.add(path, inputFolderPath);

        /* Should copy toc.yaml files to output dir only when running --output-format=md */
        if (outputFormat === 'md') {
            const outputDir = resolve(outputFolderPath, dirname(path));
            const tocDestPath = resolve(outputFolderPath, path);

            shell.mkdir('-p', outputDir);
            writeFileSync(tocDestPath, TocService.getForPath(path));
        }
    }
}

for (const pathToFile of TocService.getNavigationPaths()) {
    const pathToDir: string = dirname(pathToFile);
    const filename: string = basename(pathToFile);
    const fileExtension: string = extname(pathToFile);
    const fileBaseName: string = basename(filename, fileExtension);
    const outputDir: string = resolve(outputFolderPath, pathToDir);

    const outputFileName = `${fileBaseName}.${outputFormat}`;
    const outputPath: string = resolve(outputDir, outputFileName);

    let outputFileContent = '';

    shell.mkdir('-p', outputDir);

    if (outputFormat === 'md') {
        if (fileExtension === '.yaml') {
            const from = resolve(inputFolderPath, pathToFile);
            const to = resolve(outputDir, filename);

            copyFileSync(from, to);
            continue;
        }

        outputFileContent = resolveMd2Md(pathToFile, outputDir);
    }

    if (outputFormat === 'html') {
        if (fileExtension !== '.yaml' && fileExtension !== '.md') {
            const from = resolve(inputFolderPath, pathToFile);
            const to = resolve(outputDir, filename);

            copyFileSync(from, to);
            continue;
        }

        outputFileContent = resolveMd2HTML({
            inputPath: pathToFile,
            outputBundlePath,
            fileExtension,
            outputPath,
            filename,
        });
    }

    writeFileSync(outputPath, outputFileContent);
}

/* Should copy all assets only when running --output-format=html */
if (outputFormat === 'html') {
    const assetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: [
            ...ignore,
            '**/*.yaml',
            '**/*.md',
        ],
    });

    for (const pathToAsset of assetFilePath) {
        const outputDir: string = resolve(outputFolderPath, dirname(pathToAsset));
        const from = resolve(inputFolderPath, pathToAsset);
        const to = resolve(outputFolderPath, pathToAsset);

        shell.mkdir('-p', outputDir);
        copyFileSync(from, to);
    }
}

/* Copy js bundle to user' output folder */
const sourceBundlePath = resolve(BUILD_FOLDER_PATH, BUNDLE_FILENAME);
const destBundlePath = resolve(outputBundlePath, BUNDLE_FILENAME);
shell.mkdir('-p', outputBundlePath);
shell.cp(sourceBundlePath, destBundlePath);

/* Copy all generated files to user' output folder */
const userOutputFolder = resolve(_yargs.argv.output);
shell.mkdir('-p', userOutputFolder);
shell.cp('-r', join(tmpOutputFolder, '*'), userOutputFolder);

/* Remove temporary folders */
shell.rm('-rf', tmpInputFolder, tmpOutputFolder);
