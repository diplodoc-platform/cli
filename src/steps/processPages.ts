import type {DocInnerProps} from '@diplodoc/client';
import type {Run} from '~/commands/build';
import {basename, dirname, extname, join, resolve} from 'node:path';
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
import {ArgvService, LeadingService, PluginService, SearchService, TocService} from '../services';
import {generateStaticMarkup} from '~/pages/document';
import {generateStaticRedirect} from '~/pages/redirect';
import {getDepth, joinSinglePageResults} from '../utils';
import {getVCSConnector} from '../vcs-connector';
import {VCSConnector} from '../vcs-connector/connector-models';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(run: Run): Promise<void> {
    const vcsConnector = await getVCSConnector();

    PluginService.setPlugins();

    await mapLimit(
        run.toc.entries,
        PAGE_PROCESS_CONCURRENCY,
        asyncify(async (pathToFile: string) => {
            const pathData = getPathData(
                pathToFile,
                run.input,
                run.output,
                run.config.outputFormat,
                run.bundlePath,
            );

            run.logger.proc(pathToFile);

            const metaDataOptions = getMetaDataOptions(pathData, vcsConnector);

            await preparingPagesByOutputFormat(
                run,
                pathData,
                metaDataOptions,
                run.config.template.features.conditions,
                run.config.singlePage,
            );
        }),
    );

    if (run.config.singlePage) {
        await saveSinglePages(run);
    }

    if (run.config.outputFormat === 'html') {
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
    const outputTocDir = TocService.getTocDir(pathToFile);

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
    try {
        await Promise.all(
            Object.keys(singlePageResults).map(async (tocDir) => {
                if (!singlePageResults[tocDir].length) {
                    return;
                }

                const relativeTocDir = tocDir.replace(/\\/g, '/').replace(/^\/?/, '');
                const singlePageBody = joinSinglePageResults(
                    singlePageResults[tocDir],
                    relativeTocDir,
                );

                const toc = TocService.getForPath(join(relativeTocDir, 'toc.yaml'))[1] as YfmToc;
                const lang = run.config.lang ?? Lang.RU;
                const langs = run.config.langs.length ? run.config.langs : [lang];

                const pageData = {
                    data: {
                        leading: false as const,
                        html: singlePageBody,
                        headings: [],
                        meta: run.config.resources,
                        title: toc.title || '',
                    },
                    router: {
                        pathname: SINGLE_PAGE_FILENAME,
                        depth: getDepth(relativeTocDir) + 1,
                    },
                    lang,
                    langs,
                };

                // Save the full single page for viewing locally
                const singlePageFn = join(run.output, tocDir, SINGLE_PAGE_FILENAME);
                const singlePageDataFn = join(run.output, tocDir, SINGLE_PAGE_DATA_FILENAME);
                const singlePageContent = generateStaticMarkup(
                    pageData,
                    {path: join(relativeTocDir, 'single-page-toc'), content: toc},
                    (toc.title as string) || '',
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
    const redirectLangRelativePath = `./${run.config.lang}/index.html`;
    const redirectPagePath = join(run.output, 'index.html');
    const redirectLangPath = join(run.output, redirectLangRelativePath);

    if (!existsSync(redirectPagePath) && existsSync(redirectLangPath)) {
        const content = generateStaticRedirect(run.config.lang, redirectLangRelativePath);
        writeFileSync(redirectPagePath, content);
    }
}

function savePageResultForSinglePage(pageProps: DocInnerProps, pathData: PathData): void {
    const {pathToFile, outputTocDir} = pathData;

    // TODO: allow page-constructor pages?
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
        // TODO: handle file resources
    });
}

function getMetaDataOptions(pathData: PathData, vcsConnector?: VCSConnector): MetaDataOptions {
    const {contributors, addSystemMeta, resources, allowCustomResources, vcs} =
        ArgvService.getConfig();

    const metaDataOptions: MetaDataOptions = {
        pathData,
        vcsConnector,
        isContributorsEnabled: Boolean(contributors && vcsConnector),
        addSystemMeta,
        shouldAlwaysAddVCSPath: typeof vcs?.remoteBase === 'string' && vcs.remoteBase.length > 0,
    };

    if (allowCustomResources && resources) {
        const allowedResources = Object.entries(resources).reduce((acc: Resources, [key, val]) => {
            if (Object.keys(ResourceType).includes(key)) {
                acc[key as keyof typeof ResourceType] = val;
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
    const {allowCustomResources} = ArgvService.getConfig();

    try {
        shell.mkdir('-p', outputDir);

        const isYamlFileExtension = fileExtension === '.yaml';

        if (resolveConditions && fileBaseName === 'index' && isYamlFileExtension) {
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
                await processingFileToMd(run, path, metaDataOptions);
                return;
            case 'html': {
                const resolvedFileProps = await processingFileToHtml(run, path, metaDataOptions);

                SearchService.add(pathToFile, resolvedFileProps);

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

async function processingFileToMd(
    run: Run,
    path: PathData,
    metaDataOptions: MetaDataOptions,
): Promise<void> {
    const {outputPath, pathToFile} = path;

    await resolveMd2Md(run, {
        inputPath: pathToFile,
        outputPath,
        metadata: metaDataOptions,
    });
}

async function processingFileToHtml(
    run: Run,
    path: PathData,
    metaDataOptions: MetaDataOptions,
): Promise<DocInnerProps> {
    const {outputBundlePath, filename, fileExtension, outputPath, pathToFile} = path;

    return resolveMd2HTML(run, {
        inputPath: pathToFile,
        outputBundlePath,
        fileExtension,
        outputPath,
        filename,
        metadata: metaDataOptions,
    });
}
