import * as yargs from 'yargs';
import walkSync from 'walk-sync';
import {extname, resolve, basename, dirname} from 'path';
import {mkdirSync, existsSync, writeFileSync, copyFileSync} from 'fs';

import {TocService, PresetService, ArgvService} from './services';
import {FileTransformer, transformToc} from './utils';
import {SERVICE_FILES_GLOB} from './constants';
import {generateStaticMarkup} from './app';

const argv = yargs
    .option('input', {
        alias: 'i',
        describe: 'Path to input folder with .md files',
    })
    .option('output', {
        alias: 'o',
        describe: 'Path to output folder'
    })
    .option('config', {
        alias: 'c',
        default: './yfm.config.yaml',
        describe: 'YFM configuration file'
    })
    .example(`yfm-docs -i ./input -o ./output`, '')
    .demandOption(['input', 'output'], 'Please provide input and output arguments to work with this tool')
    .help()
    .argv;

ArgvService.parse(argv);

const {
    input: inputFolderPath,
    output: outputFolderPath,
    config: {audience = '', ignore = []},
} = ArgvService.argv;

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
            TocService.parseFile(path, inputFolderPath);
            break;
        case 'presets':
            PresetService.parseFile(resolve(inputFolderPath, path), audience);
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
            const outputPath: string = resolve(outputDir, `${fileBaseName}.html`);
            const toc = TocService.getForPath(pathToFile);

            const transformFn: Function = FileTransformer[fileExtension];
            const data: any = transformFn({
                path: resolve(inputFolderPath, pathToFile),
                root: resolve(inputFolderPath),
            });

            const html: string = generateStaticMarkup({
                isLeading: pathToFile.endsWith('index.yaml'),
                toc: transformToc(toc, pathToDir) || {},
                ...data,
            });

            writeFileSync(outputPath, html);
            break;
        default:
            copyFileSync(resolve(inputFolderPath, pathToFile), resolve(outputDir, fileName));
    }
}
