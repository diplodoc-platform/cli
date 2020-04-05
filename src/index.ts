import * as yargs from 'yargs';
import walkSync from 'walk-sync';
import {extname, resolve, basename, dirname, relative, join} from 'path';
import {mkdirSync, existsSync, writeFileSync, copyFileSync, readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {TocService, PresetService, ArgvService} from './services';
import {FileTransformer, transformToc, generateStaticMarkup} from './utils';
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
    const fileName: string = basename(pathToFile);
    const fileExtension: string = extname(pathToFile);
    const fileBaseName: string = basename(fileName, fileExtension);
    const outputDir: string = resolve(outputFolderPath, pathToDir);

    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, {recursive: true});
    }

    switch (fileExtension) {
        case '.yaml':
        case '.md':
            const outputFileName = `${fileBaseName}.html`;
            const outputPath: string = resolve(outputDir, outputFileName);
            const toc: any = TocService.getForPath(pathToFile);
            const tocBase: string = toc ? toc.base : '';
            const pathToIndex: string = pathToDir !== tocBase ? pathToDir.replace(tocBase, '..') : '';

            const transformFn: Function = FileTransformer[fileExtension];
            const data: any = transformFn({
                path: pathToFile,
            });
            const props: any = {
                isLeading: pathToFile.endsWith('index.yaml'),
                toc: transformToc(toc, pathToDir) || {},
                pathname: join(pathToIndex, outputFileName),
                ...data,
            };
            const relativePathToBundle: string = relative(resolve(outputDir), resolve(outputBundlePath));

            const html: string = generateStaticMarkup(props, relativePathToBundle);

            writeFileSync(outputPath, html);
            break;
        default:
            copyFileSync(resolve(inputFolderPath, pathToFile), resolve(outputDir, fileName));
    }
}
