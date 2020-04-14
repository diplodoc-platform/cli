import * as yargs from 'yargs';
import walkSync from 'walk-sync';
import {extname, resolve, basename, dirname, join} from 'path';
import {mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {TocService, PresetService, ArgvService} from './services';
import {resolveMd2Md, resolveMd2HTML} from './utils';
import {SERVICE_FILES_GLOB, BUNDLE_FILENAME, BUNDLE_FOLDER} from './constants';
import {YfmArgv} from './models';

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
    })
    .option('output', {
        alias: 'o',
        describe: 'Path to output folder'
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
        default: {},
        describe: 'List of markdown variables'
    })
    .option('plugins', {
        alias: 'p',
        describe: 'List of yfm-transform plugins'
    })
    .option('ignore', {
        default: [],
        describe: 'List of globs that should be ignored'
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

ArgvService.init(_yargs.argv as any as YfmArgv);

const {
    input: inputFolderPath,
    output: outputFolderPath,
    outputFormat,
    audience = '',
    ignore = [],
} = ArgvService.getConfig();

const outputBundlePath: string = join(outputFolderPath, BUNDLE_FOLDER);

mkdirSync(resolve(outputBundlePath), {recursive: true});
copyFileSync(
    resolve(BUILD_FOLDER_PATH, BUNDLE_FILENAME),
    resolve(outputBundlePath, BUNDLE_FILENAME)
);

const serviceFilePaths: string[] = walkSync(inputFolderPath, {
    directories: false,
    includeBasePath: false,
    globs: SERVICE_FILES_GLOB,
});

for (const path of serviceFilePaths) {
    const fileExtension: string = extname(path);
    const fileBaseName: string = basename(path, fileExtension);

    switch (fileBaseName) {
        case 'toc':
        case 'toc-internal':
            TocService.add(path, inputFolderPath);
            break;
        case 'presets':
            PresetService.add(path, audience);
            break;
    }
}

const pageFilePaths: string[] = walkSync(inputFolderPath, {
    directories: false,
    includeBasePath: false,
    ignore: [...SERVICE_FILES_GLOB, ...ignore],
});

for (const pathToFile of pageFilePaths) {
    const pathToDir: string = dirname(pathToFile);
    const filename: string = basename(pathToFile);
    const fileExtension: string = extname(pathToFile);
    const fileBaseName: string = basename(filename, fileExtension);
    const outputDir: string = resolve(outputFolderPath, pathToDir);

    const outputFileName = `${fileBaseName}.${outputFormat}`;
    const outputPath: string = resolve(outputDir, outputFileName);

    let outputFileContent = '';

    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, {recursive: true});
    }

    if (outputFormat === 'md') {
        if (fileExtension === '.yaml') {
            copyFileSync(resolve(inputFolderPath, pathToFile), resolve(outputDir, filename));
            continue;
        }

        outputFileContent = resolveMd2Md(pathToFile, outputDir);
    }

    if (outputFormat === 'html') {
        if (fileExtension !== '.yaml' && fileExtension !== '.md') {
            copyFileSync(resolve(inputFolderPath, pathToFile), resolve(outputDir, filename));
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
