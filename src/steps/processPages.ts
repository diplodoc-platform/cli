import {basename, dirname, extname, resolve, join, relative} from 'path';
import shell from 'shelljs';
import {copyFileSync, writeFileSync} from 'fs';
import {bold} from 'chalk';

import log from '@doc-tools/transform/lib/log';

import {ArgvService, LeadingService, TocService, PluginService} from '../services';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {generateStaticMarkup, joinSinglePageResults, logger, transformTocForSinglePage} from '../utils';
import {MetaDataOptions, SinglePageResult, PathData, YfmToc, ResolveMd2HTMLResult} from '../models';
import {VCSConnector} from '../vcs-connector/connector-models';
import {getVCSConnector} from '../vcs-connector';
import {
    SINGLE_PAGE_FILENAME,
    SINGLE_PAGE_DATA_FILENAME,
    Lang,
} from '../constants';

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

    PluginService.setPlugins();

    for (const pathToFile of TocService.getNavigationPaths()) {
        const pathData = getPathData(pathToFile, inputFolderPath, outputFolderPath, outputFormat, outputBundlePath);

        logger.proc(pathToFile);

        const metaDataOptions = getMetaDataOptions(pathData, inputFolderPath.length, vcsConnector);

        promises.push(preparingPagesByOutputFormat(pathData, metaDataOptions, resolveConditions, singlePage));
    }

    await Promise.all(promises);

    if (singlePage) {
        await saveSinglePages(outputBundlePath);
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
    const outputPath = resolve(outputDir, outputFileName);
    const resolvedPathToFile = resolve(inputFolderPath, pathToFile);
    const outputTocDir = TocService.getTocDir(resolvedPathToFile);

    const pathData: PathData = {
        pathToFile,
        resolvedPathToFile,
        filename,
        fileBaseName,
        fileExtension,
        outputDir,
        outputPath,
        outputFormat,
        outputBundlePath,
        outputTocDir,
        inputFolderPath,
        outputFolderPath,
    };

    return pathData;
}

async function saveSinglePages(outputBundlePath: string) {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        lang,
    } = ArgvService.getConfig();

    try {
        await Promise.all(Object.keys(singlePageResults).map(async (tocDir) => {
            if (!singlePageResults[tocDir].length) {
                return;
            }

            const singlePageBody = joinSinglePageResults(singlePageResults[tocDir], inputFolderPath, tocDir);
            const tocPath = join(relative(inputFolderPath, tocDir), 'toc.yaml');
            const toc: YfmToc|null = TocService.getForPath(tocPath) || null;
            const preparedToc = transformTocForSinglePage(toc, {
                root: inputFolderPath,
                currentPath: join(tocDir, SINGLE_PAGE_FILENAME),
            });

            const pageData = {
                data: {
                    leading: false,
                    html: singlePageBody,
                    headings: [],
                    meta: {},
                    toc: preparedToc,
                },
                router: {
                    pathname: SINGLE_PAGE_FILENAME,
                },
                lang: lang || Lang.RU,
            } as ResolveMd2HTMLResult;

            const outputTocDir = resolve(outputFolderPath, relative(inputFolderPath, tocDir));
            const relativeOutputBundlePath = relative(outputTocDir, outputBundlePath);

            // Save the full single page for viewing locally
            const singlePageFn = join(tocDir, SINGLE_PAGE_FILENAME);
            const singlePageDataFn = join(tocDir, SINGLE_PAGE_DATA_FILENAME);
            const singlePageContent = generateStaticMarkup(pageData, relativeOutputBundlePath);

            writeFileSync(singlePageFn, singlePageContent);
            writeFileSync(singlePageDataFn, JSON.stringify(pageData));
        }));
    } catch (error) {
        console.log(error);
    }
}

function savePageResultForSinglePage(pageProps: ResolveMd2HTMLResult, pathData: PathData): void {
    const {pathToFile, outputTocDir} = pathData;

    if (pageProps.data.leading) {
        return;
    }

    singlePagePaths[outputTocDir] = singlePagePaths[outputTocDir] || new Set();

    if (singlePagePaths[outputTocDir].has(pathToFile)) {
        return;
    }

    singlePagePaths[outputTocDir].add(pathToFile);

    singlePageResults[outputTocDir] = singlePageResults[outputTocDir] || [];
    singlePageResults[outputTocDir].push({
        path: pathToFile,
        content: pageProps.data.html,
        title: pageProps.data.title,
    });
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
    singlePage: boolean,
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
            case 'html': {
                const resolvedFileProps = await processingFileToHtml(path, metaDataOptions);

                if (singlePage) {
                    savePageResultForSinglePage(resolvedFileProps, path);
                }

                return;
            }
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

async function processingFileToHtml(path: PathData, metaDataOptions: MetaDataOptions): Promise<ResolveMd2HTMLResult> {
    const {
        outputBundlePath,
        filename,
        fileExtension,
        outputPath,
        pathToFile,
    } = path;

    return resolveMd2HTML({
        inputPath: pathToFile,
        outputBundlePath,
        fileExtension,
        outputPath,
        filename,
        metadata: metaDataOptions,
    });
}
