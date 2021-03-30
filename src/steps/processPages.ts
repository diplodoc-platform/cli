import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {joinSinglePageResults, logger} from '../utils';
import {MetaDataOptions, SinglePageResult, PathData, Contributors} from '../models';
import {Lang, SINGLE_PAGE_FOLDER} from '../constants';
import {Client} from '../client/models';
import {getAllContributors} from '../services/contributors';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(outputBundlePath: string, client: Client): Promise<void> {

    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
        contributors,
        resolveConditions,
    } = ArgvService.getConfig();

    const allContributors = contributors ? await getAllContributors(client) : {};
    const isContributorsExist = contributors && Object.getOwnPropertyNames(allContributors).length > 0;
    const inputFolderPathLength = inputFolderPath.length;

    const promises: Promise<void>[] = [];

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathData = getPathData(pathToFile, inputFolderPath, outputFolderPath, outputFormat, outputBundlePath);

        logger.proc(pathToFile);

        if (singlePage && outputFormat === 'md') {
            await preparingSinglePages(pathData, singlePage, outputFolderPath);
        }

        // Get contributors only for RU files, because EN files manually generated
        promises.push(preparingPagesByOutputFormat(
            pathData,
            client,
            allContributors,
            isContributorsExist && pathToFile.startsWith(Lang.RU),
            inputFolderPathLength,
            resolveConditions));
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

async function preparingPagesByOutputFormat(
    path: PathData,
    client: Client,
    allContributors: Contributors,
    isContributorsExist: boolean,
    inputFolderPathLength: number,
    resolveConditions: boolean): Promise<void> {
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

        const metaDataOptions: MetaDataOptions = {
            contributorsData: undefined,
        };

        if (isContributorsExist) {
            metaDataOptions.contributorsData = {
                fileData: {
                    tmpInputfilePath: resolvedPathToFile,
                    inputFolderPathLength,
                    allContributors,
                    fileContent: '',
                },
                client,
            };
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
