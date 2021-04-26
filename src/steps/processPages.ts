import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {joinSinglePageResults, logger} from '../utils';
import {MetaDataOptions, SinglePageResult, PathData} from '../models';
import {SINGLE_PAGE_FOLDER} from '../constants';
import {VCSConnector} from '../vcs-connector/models';
import {getVCSConnector} from '../vcs-connector';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(outputBundlePath: string): Promise<void> {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
        resolveConditions,
    } = ArgvService.getConfig();

    const vcsConnector = await getVCSConnector();

    const promises: Promise<void>[] = [];

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathData = getPathData(pathToFile, inputFolderPath, outputFolderPath, outputFormat, outputBundlePath);

        logger.proc(pathToFile);

        if (singlePage && outputFormat === 'md') {
            await preparingSinglePages(pathData, singlePage, outputFolderPath);
        }

        const metaDataOptions = getMetaDataOptions(pathData, inputFolderPath.length, vcsConnector);

        promises.push(preparingPagesByOutputFormat(pathData, metaDataOptions, resolveConditions));
    }

    await Promise.all(promises);
}

function getPathData(
    pathToFile: string,
    inputFolderPath: string,
    outputFolderPath: string,
    outputFormat: string,
    outputBundlePath: string,
): PathData {
    const pathToDir: string = dirname(pathToFile);
    const filename: string = basename(pathToFile);
    const fileExtension: string = extname(pathToFile);
    const fileBaseName: string = basename(filename, fileExtension);
    const outputDir = resolve(outputFolderPath, pathToDir);
    const outputFileName = `${fileBaseName}.${outputFormat}`;

    const pathData: PathData = {
        pathToFile,
        resolvedPathToFile: resolve(inputFolderPath, pathToFile),
        filename,
        fileBaseName,
        fileExtension,
        outputDir,
        outputPath: resolve(outputDir, outputFileName),
        outputFormat,
        outputBundlePath,
    };

    return pathData;
}

async function preparingSinglePages(pathData: PathData, singlePage: boolean, outputFolderPath: string): Promise<void> {
    try {
        const {pathToFile, outputPath, fileExtension} = pathData;
        const pathToDir: string = dirname(pathToFile);
        const outputSinglePageDir = resolve(TocService.getTocDir(outputPath), SINGLE_PAGE_FOLDER);
        const outputSinglePageFileDir = resolve(outputSinglePageDir, pathToDir);

        shell.mkdir('-p', outputSinglePageFileDir);

        const isExistFileAsSinglePage =
            singlePagePaths[outputSinglePageDir] && singlePagePaths[outputSinglePageDir].has(pathToFile);

        if (!(fileExtension === '.yaml') && !isExistFileAsSinglePage) {
            const outputSinglePageContent =
                await resolveMd2Md({inputPath: pathToFile, outputPath: outputSinglePageFileDir, singlePage});

            const absolutePathToFile = resolve(outputFolderPath, pathToFile);
            const relativePathToOriginalFile = relative(outputSinglePageDir, absolutePathToFile);

            singlePageResults[outputSinglePageDir] = singlePageResults[outputSinglePageDir] || [];
            singlePageResults[outputSinglePageDir].push({
                path: relativePathToOriginalFile,
                content: outputSinglePageContent,
            });

            singlePagePaths[outputSinglePageDir] = singlePagePaths[outputSinglePageDir] || new Set();
            singlePagePaths[outputSinglePageDir].add(pathToFile);
        }

        const singlePageFn = join(outputSinglePageDir, 'index.md');
        const content = joinSinglePageResults(singlePageResults[outputSinglePageDir]);

        writeFileSync(singlePageFn, content);
    } catch (error) {
        console.log(error);
    }
}

function getMetaDataOptions(pathData: PathData, inputFolderPathLength: number, vcsConnector?: VCSConnector): MetaDataOptions {
    const {contributors} = ArgvService.getConfig();

    const metaDataOptions: MetaDataOptions = {
        vcsConnector,
        fileData: {
            tmpInputFilePath: pathData.resolvedPathToFile,
            inputFolderPathLength,
            fileContent: '',
        },
        isAddContributors: Boolean(contributors && vcsConnector),
    };

    return metaDataOptions;
}

async function preparingPagesByOutputFormat(
    path: PathData,
    metaDataOptions: MetaDataOptions,
    resolveConditions: boolean,
): Promise<void> {
    const {
        filename,
        fileExtension,
        fileBaseName,
        outputDir,
        resolvedPathToFile,
        outputFormat,
        pathToFile,
    } = path;

    try {
        shell.mkdir('-p', outputDir);

        const isYamlFileExtension = fileExtension === '.yaml';

        if (resolveConditions && fileBaseName === 'index' && isYamlFileExtension) {
            LeadingService.filterFile(pathToFile);
        }

        if (outputFormat === 'md' && isYamlFileExtension ||
            outputFormat === 'html' && !isYamlFileExtension && fileExtension !== '.md') {
            copyFileWithoutChanges(resolvedPathToFile, outputDir, filename);
            return;
        }

        switch (outputFormat) {
            case 'md':
                await processingFileToMd(path, metaDataOptions);
                return;
            case 'html':
                await processingFileToHtml(path, metaDataOptions);
                return;
        }
    } catch (e) {
        console.log(e);
        log.error(` No such file or has no access to ${bold(resolvedPathToFile)}`);
    }
}

function copyFileWithoutChanges(resolvedPathToFile: string, outputDir: string, filename: string): void {
    const from = resolvedPathToFile;
    const to = resolve(outputDir, filename);

    copyFileSync(from, to);
}

async function processingFileToMd(path: PathData, metaDataOptions: MetaDataOptions): Promise<void> {
    const {outputPath, pathToFile} = path;

    await resolveMd2Md({
        inputPath: pathToFile,
        outputPath,
        ...metaDataOptions,
    });
}

async function processingFileToHtml(path: PathData, metaDataOptions: MetaDataOptions): Promise<void> {
    const {
        outputBundlePath,
        filename,
        fileExtension,
        outputPath,
        pathToFile,
    } = path;

    await resolveMd2HTML({
        inputPath: pathToFile,
        outputBundlePath,
        fileExtension,
        outputPath,
        filename,
        ...metaDataOptions,
    });
}
