import type {DocInnerProps} from '@diplodoc/client';
import {basename, dirname, extname, join, relative, resolve} from 'path';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import log from '@diplodoc/transform/lib/log';
import {asyncify, mapLimit} from 'async';
import {bold} from 'chalk';
import {dump, load} from 'js-yaml';
import shell from 'shelljs';

import {
    Lang,
    PAGE_PROCESS_CONCURRENCY,
    ResourceType,
    SINGLE_PAGE_DATA_FILENAME,
    SINGLE_PAGE_FILENAME,
} from '../constants';
import {
    LeadingPage,
    MetaDataOptions,
    PathData,
    Resources,
    SinglePageResult,
    YfmToc,
} from '../models';
import {resolveMd2HTML, resolveMd2Md} from '../resolvers';
import {LeadingService, PluginService, TocService} from '../services';
import {
    generateStaticMarkup,
    joinSinglePageResults,
    logger,
    transformTocForSinglePage,
} from '../utils';
import {getVCSConnector} from '../vcs-connector';
import {VCSConnector} from '../vcs-connector/connector-models';
import {generateStaticRedirect} from '../utils/redirect';
import {Run} from '~/commands/build';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(run: Run): Promise<void> {
    const {outputFormat, singlePage} = run.config;
    const vcsConnector = await getVCSConnector();

    PluginService.setPlugins();

    const navigationPaths = TocService.getNavigationPaths();

    await mapLimit(
        navigationPaths,
        PAGE_PROCESS_CONCURRENCY,
        asyncify(async (pathToFile: string) => {
            const pathData = getPathData(
                pathToFile,
                run.input,
                run.output,
                outputFormat,
                run.bundlePath,
            );

            logger.proc(pathToFile);

            const metaDataOptions = getMetaDataOptions(
                run,
                pathData,
                vcsConnector,
            );

            await preparingPagesByOutputFormat(
                run,
                pathData,
                metaDataOptions
            );
        }),
    );

    if (singlePage) {
        await saveSinglePages(run);
    }

    if (outputFormat === 'html') {
        saveRedirectPage(run);
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

async function saveSinglePages(run: Run) {
    const {lang, langs, resources} = run.config;

    try {
        await Promise.all(
            Object.keys(singlePageResults).map(async (tocDir) => {
                if (!singlePageResults[tocDir].length) {
                    return;
                }

                const singlePageBody = joinSinglePageResults(
                    singlePageResults[tocDir],
                    run.input,
                    tocDir,
                );
                const tocPath = join(relative(run.input, tocDir), 'toc.yaml');
                const toc: YfmToc | null = TocService.getForPath(tocPath) || null;
                const preparedToc = transformTocForSinglePage(toc, {
                    root: run.input,
                    currentPath: join(tocDir, SINGLE_PAGE_FILENAME),
                }) as YfmToc;

                const pageData = {
                    data: {
                        leading: false as const,
                        html: singlePageBody,
                        headings: [],
                        meta: resources || {},
                        toc: preparedToc,
                    },
                    router: {
                        pathname: SINGLE_PAGE_FILENAME,
                    },
                    lang,
                    langs,
                };

                // Save the full single page for viewing locally
                const singlePageFn = join(tocDir, SINGLE_PAGE_FILENAME);
                const singlePageDataFn = join(tocDir, SINGLE_PAGE_DATA_FILENAME);
                const singlePageContent = generateStaticMarkup(
                    pageData,
                    toc?.root?.deepBase || toc?.deepBase || 0,
                );

                writeFileSync(singlePageFn, singlePageContent);
                writeFileSync(singlePageDataFn, JSON.stringify(pageData));
            }),
        );
    } catch (error) {
        console.log(error);
    }
}

function saveRedirectPage(run: Run): void {
    const {lang, langs} = run.config;
    const redirectLang = lang || langs?.[0] || Lang.RU;
    const redirectLangRelativePath = `./${redirectLang}/index.html`;
    const redirectPagePath = join(run.output, 'index.html');
    const redirectLangPath = join(run.output, redirectLangRelativePath);

    if (!existsSync(redirectPagePath) && existsSync(redirectLangPath)) {
        const content = generateStaticRedirect(redirectLang, redirectLangRelativePath);
        writeFileSync(redirectPagePath, content);
    }
}

function savePageResultForSinglePage(pageProps: DocInnerProps, pathData: PathData): void {
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

function getMetaDataOptions(
    run: Run,
    pathData: PathData,
    vcsConnector?: VCSConnector,
): MetaDataOptions {
    const inputFolderPathLength = run.input.length;
    const {contributors, addSystemMeta, resources, allowCustomResources} = run.config;

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

    if (allowCustomResources && resources) {
        const allowedResources = Object.entries(resources).reduce((acc: Resources, [key, val]) => {
            if (Object.keys(ResourceType).includes(key)) {
                acc[key as keyof ResourceType] = val;
            }
            return acc;
        }, {});

        metaDataOptions.resources = allowedResources;
    }

    return metaDataOptions;
}

async function preparingPagesByOutputFormat(
    run: Run,
    path: PathData,
    metaDataOptions: MetaDataOptions,
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
    const {allowCustomResources, singlePage, template} = run.config;

    try {
        shell.mkdir('-p', outputDir);

        const isYamlFileExtension = fileExtension === '.yaml';

        if (template.features.conditions && fileBaseName === 'index' && isYamlFileExtension) {
            LeadingService.filterFile(pathToFile);
        }

        if (outputFormat === 'md' && isYamlFileExtension && allowCustomResources) {
            processingYamlFile(path, metaDataOptions);
            return;
        }

        if (
            (outputFormat === 'md' && isYamlFileExtension) ||
            (outputFormat === 'html' && !isYamlFileExtension && fileExtension !== '.md')
        ) {
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
//@ts-ignore
function processingYamlFile(path: PathData, metaDataOptions: MetaDataOptions) {
    const {pathToFile, outputFolderPath, inputFolderPath} = path;

    const filePath = resolve(inputFolderPath, pathToFile);
    const content = readFileSync(filePath, 'utf8');
    const parsedContent = load(content) as LeadingPage;

    if (metaDataOptions.resources) {
        parsedContent.meta = {...parsedContent.meta, ...metaDataOptions.resources};
    }

    writeFileSync(resolve(outputFolderPath, pathToFile), dump(parsedContent));
}

function copyFileWithoutChanges(
    resolvedPathToFile: string,
    outputDir: string,
    filename: string,
): void {
    const from = resolvedPathToFile;
    const to = resolve(outputDir, filename);

    shell.cp(from, to);
}

async function processingFileToMd(path: PathData, metaDataOptions: MetaDataOptions): Promise<void> {
    const {outputPath, pathToFile} = path;

    await resolveMd2Md({
        inputPath: pathToFile,
        outputPath,
        metadata: metaDataOptions,
    });
}

async function processingFileToHtml(
    path: PathData,
    metaDataOptions: MetaDataOptions,
): Promise<DocInnerProps> {
    const {outputBundlePath, filename, fileExtension, outputPath, pathToFile} = path;
    const {deepBase, deep} = TocService.getDeepForPath(pathToFile);

    return resolveMd2HTML({
        inputPath: pathToFile,
        outputBundlePath,
        fileExtension,
        outputPath,
        filename,
        metadata: metaDataOptions,
        deep,
        deepBase,
    });
}
