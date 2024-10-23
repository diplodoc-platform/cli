import type {DocInnerProps} from '@diplodoc/client';
import {basename, dirname, extname, join, relative, resolve, sep} from 'path';
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
} from '~/constants';
import {
    LeadingPage,
    MetaDataOptions,
    PathData,
    Resources,
    SinglePageResult,
    YfmToc,
} from '~/models';
import {resolveMd2HTML, resolveMd2Md} from '~/resolvers';
import {ArgvService, LeadingService, PluginService, SearchService, TocService} from '~/services';
import {joinSinglePageResults, logger, transformTocForSinglePage} from '~/utils';
import {generateStaticMarkup, generateStaticRedirect} from '~/pages';
import {getVCSConnector} from '~/vcs-connector';
import {VCSConnector} from '~/vcs-connector/connector-models';
import {RevisionContext} from '~/context/context';
import {DependencyContext, FsContext} from '@diplodoc/transform/lib/typings';

const singlePageResults: Record<string, SinglePageResult[]> = {};
const singlePagePaths: Record<string, Set<string>> = {};

// Processes files of documentation (like index.yaml, *.md)
export async function processPages(
    fs: FsContext,
    deps: DependencyContext,
    outputBundlePath: string,
    context: RevisionContext,
): Promise<void> {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
        resolveConditions,
    } = ArgvService.getConfig();

    const vcsConnector = await getVCSConnector();

    PluginService.setPlugins();

    const navigationPaths = TocService.getNavigationPaths();

    await mapLimit(
        navigationPaths,
        PAGE_PROCESS_CONCURRENCY,
        asyncify(async (pathToFile: string) => {
            const pathData = getPathData(
                pathToFile,
                inputFolderPath,
                outputFolderPath,
                outputFormat,
                outputBundlePath,
            );

            logger.proc(pathToFile);

            const metaDataOptions = getMetaDataOptions(pathData, vcsConnector);

            await preparingPagesByOutputFormat(
                fs,
                deps,
                pathData,
                metaDataOptions,
                resolveConditions,
                singlePage,
                context,
            );
        }),
    );

    if (singlePage) {
        await saveSinglePages(fs);
    }

    if (outputFormat === 'html') {
        await saveRedirectPage(fs, outputFolderPath);
    }
}

export const getProcessPageFn = async (
    fs: FsContext,
    deps: DependencyContext,
    context: RevisionContext,
    outputBundlePath: string,
) => {
    const {
        input: inputFolderPath,
        output: outputFolderPath,
        outputFormat,
        singlePage,
        resolveConditions,
    } = ArgvService.getConfig();

    const vcsConnector = await getVCSConnector();

    PluginService.setPlugins();

    return async (pathToFile: string) => {
        const pathData = getPathData(
            pathToFile,
            inputFolderPath,
            outputFolderPath,
            outputFormat,
            outputBundlePath,
        );

        logger.proc(pathToFile);

        const metaDataOptions = getMetaDataOptions(pathData, vcsConnector);

        await preparingPagesByOutputFormat(
            fs,
            deps,
            pathData,
            metaDataOptions,
            resolveConditions,
            singlePage,
            context,
        );
    };
};

export const finishProcessPages = async (fs: FsContext) => {
    const {output: outputFolderPath, outputFormat, singlePage} = ArgvService.getConfig();

    if (singlePage) {
        await saveSinglePages(fs);
    }

    if (outputFormat === 'html') {
        saveRedirectPage(fs, outputFolderPath);
    }
};

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

async function saveSinglePages(fs: FsContext) {
    const {
        input: inputFolderPath,
        lang: configLang,
        langs: configLangs,
        resources,
    } = ArgvService.getConfig();

    try {
        await Promise.all(
            Object.keys(singlePageResults).map(async (tocDir) => {
                if (!singlePageResults[tocDir].length) {
                    return;
                }

                const singlePageBody = joinSinglePageResults(
                    singlePageResults[tocDir],
                    inputFolderPath,
                    tocDir,
                );
                const tocPath = join(relative(inputFolderPath, tocDir), 'toc.yaml');
                const toc: YfmToc | null = TocService.getForPath(tocPath) || null;
                const preparedToc = transformTocForSinglePage(toc, {
                    root: inputFolderPath,
                    currentPath: join(tocDir, SINGLE_PAGE_FILENAME),
                }) as YfmToc;

                const lang = configLang ?? Lang.RU;
                const langs = configLangs?.length ? configLangs : [lang];

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

                fs.write(singlePageFn, singlePageContent);
                fs.write(singlePageDataFn, JSON.stringify(pageData));
            }),
        );
    } catch (error) {
        console.log(error);
    }
}

async function saveRedirectPage(fs: FsContext, outputDir: string): Promise<void> {
    const {lang, langs} = ArgvService.getConfig();

    const redirectLang = lang || langs?.[0] || Lang.RU;
    const redirectLangRelativePath = `./${redirectLang}/index.html`;

    const redirectPagePath = join(outputDir, 'index.html');
    const redirectLangPath = join(outputDir, redirectLangRelativePath);

    if (!(await fs.existAsync(redirectPagePath)) && (await fs.existAsync(redirectLangPath))) {
        const content = generateStaticRedirect(redirectLang, redirectLangRelativePath);
        fs.write(redirectPagePath, content);
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
    fs: FsContext,
    deps: DependencyContext,
    path: PathData,
    metaDataOptions: MetaDataOptions,
    resolveConditions: boolean,
    singlePage: boolean,
    context: RevisionContext,
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
            processingYamlFile(fs, path, metaDataOptions);
            return;
        }

        if (
            (outputFormat === 'md' && isYamlFileExtension) ||
            (outputFormat === 'html' && !isYamlFileExtension && fileExtension !== '.md')
        ) {
            copyFileWithoutChanges(resolvedPathToFile, outputDir, filename);
            return;
        }

        await addTocPresetsDeps(path, fs, deps);

        switch (outputFormat) {
            case 'md':
                await processingFileToMd(path, metaDataOptions, context, fs, deps);
                return;
            case 'html': {
                const resolvedFileProps = await processingFileToHtml(
                    path,
                    metaDataOptions,
                    context,
                    fs,
                    deps,
                );

                SearchService.add(resolvedFileProps);

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

async function addTocPresetsDeps(path: PathData, fs: FsContext, deps: DependencyContext) {
    const {pathToFile} = path;

    const names = pathToFile.split(sep).filter((file) => !file.includes('.'));

    for (let index = names.length; index >= 1; index--) {
        const dirs = names.slice(0, index);
        const tocPath = resolve(...dirs, 'toc.yaml');
        const presetsPath = resolve(...dirs, 'presets.yaml');

        if (await fs.existAsync(tocPath)) {
            deps.markDep?.(pathToFile, tocPath, 'toc');
        }

        if (await fs.existAsync(presetsPath)) {
            deps.markDep?.(pathToFile, presetsPath, 'presets');
        }
    }
}

function processingYamlFile(fs: FsContext, path: PathData, metaDataOptions: MetaDataOptions) {
    const {pathToFile, outputFolderPath, inputFolderPath} = path;

    const filePath = resolve(inputFolderPath, pathToFile);
    const content = fs.read(filePath);
    const parsedContent = load(content) as LeadingPage;

    if (metaDataOptions.resources) {
        parsedContent.meta = {...parsedContent.meta, ...metaDataOptions.resources};
    }

    fs.write(resolve(outputFolderPath, pathToFile), dump(parsedContent));
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
    path: PathData,
    metaDataOptions: MetaDataOptions,
    context: RevisionContext,
    fs: FsContext,
    deps: DependencyContext,
): Promise<void> {
    const {outputPath, pathToFile} = path;

    await resolveMd2Md({
        inputPath: pathToFile,
        outputPath,
        metadata: metaDataOptions,
        context,
        fs,
        deps,
    });
}

async function processingFileToHtml(
    path: PathData,
    metaDataOptions: MetaDataOptions,
    context: RevisionContext,
    fs: FsContext,
    deps: DependencyContext,
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
        context,
        fs,
        deps,
    });
}
