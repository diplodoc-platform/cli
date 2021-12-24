import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService, PluginService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {joinSinglePageResults, logger} from '../utils';
import {MetaDataOptions, SinglePageResult, PathData} from '../models';
import {SINGLE_PAGE_FOLDER} from '../constants';
import {VCSConnector} from '../vcs-connector/connector-models';
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

    const singlePageNavigationPaths = TocService.getSinglePageNavigationPaths();
    PluginService.setPlugins();

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathData = getPathData(pathToFile, inputFolderPath, outputFolderPath, outputFormat, outputBundlePath);

        logger.proc(pathToFile);

        if (singlePage && outputFormat === 'md' && singlePageNavigationPaths.has(pathToFile)) {
            promises.push(preparingSinglePages(pathData, singlePage, outputFolderPath));
        }

        const metaDataOptions = getMetaDataOptions(pathData, inputFolderPath.length, vcsConnector);

        promises.push(preparingPagesByOutputFormat(pathData, metaDataOptions, resolveConditions));
    }

    await Promise.all(promises);

    if (singlePage) {
        saveSinglePages();
    }
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

function saveSinglePages() {
    try {
        for (const singlePageDir of Object.keys(singlePagePaths)) {
            if (singlePagePaths[singlePageDir].size) {
                const singlePageFn = join(singlePageDir, 'index.md');
                const content = joinSinglePageResults(singlePageResults[singlePageDir]);

                writeFileSync(singlePageFn, content);
            }
        }
    } catch (error) {
        console.log(error);
    }
}

async function preparingSinglePages(pathData: PathData, singlePage: boolean, outputFolderPath: string): Promise<void> {
    try {
        const {pathToFile, outputPath, fileExtension} = pathData;
        const outputSinglePageDir = resolve(TocService.getTocDir(outputPath), SINGLE_PAGE_FOLDER);

        singlePagePaths[outputSinglePageDir] = singlePagePaths[outputSinglePageDir] || new Set();

        const isExistFileAsSinglePage =
            singlePagePaths[outputSinglePageDir] && singlePagePaths[outputSinglePageDir].has(pathToFile);

        if (!(fileExtension === '.yaml') && !isExistFileAsSinglePage) {
            const outputSinglePageContent =
                await resolveMd2Md({
                    inputPath: pathToFile,
                    outputPath,
                    singlePage,
                    singlePageRoot: outputSinglePageDir,
                });

            const absolutePathToFile = resolve(outputFolderPath, pathToFile);
            const relativePathToOriginalFile = relative(outputSinglePageDir, absolutePathToFile);

            singlePageResults[outputSinglePageDir] = singlePageResults[outputSinglePageDir] || [];
            singlePageResults[outputSinglePageDir].push({
                path: relativePathToOriginalFile,
                content: outputSinglePageContent,
            });

            singlePagePaths[outputSinglePageDir].add(pathToFile);
        }
    } catch (error) {
        console.log(error);
    }
}

function getMetaDataOptions(pathData: PathData, inputFolderPathLength: number, vcsConnector?: VCSConnector,
): MetaDataOptions {
    const {contributors, addSystemMeta} = ArgvService.getConfig();

    const metaDataOptions: MetaDataOptions = {
        vcsConnector,
        fileData: {
            tmpInputFilePath: pathData.resolvedPathToFile,
            inputFolderPathLength,
            fileContent: '',
        },
        isContributorsEnabled: Boolean(contributors && vcsConnector),
        addSystemMeta,
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
        const message = `No such file or has no access to ${bold(resolvedPathToFile)}`;
        console.log(message, e);
        log.error(message);
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
        metadata: metaDataOptions,
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
        metadata: metaDataOptions,
    });
}
