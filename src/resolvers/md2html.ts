import {basename, dirname, join, relative, resolve, sep} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@diplodoc/transform';
import log from '@diplodoc/transform/lib/log';
import liquid from '@diplodoc/transform/lib/liquid';

import {ResolverOptions, YfmToc, ResolveMd2HTMLResult, LeadingPage} from '../models';
import {ArgvService, TocService, PluginService} from '../services';
import {
    generateStaticMarkup,
    logger,
    transformToc,
    getVarsPerRelativeFile,
    getVarsPerFileWithHash,
} from '../utils';
import {PROCESSING_FINISHED, Lang, CACHE_HIT} from '../constants';
import {getAssetsPublicPath, getUpdatedMetadata} from '../services/metadata';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import PluginEnvApi from '../utils/pluginEnvApi';
import {cacheServiceMdToHtml} from '../services/cache';
import {checkLogWithoutProblems, getLogState} from '../services/utils';

export interface FileTransformOptions {
    path: string;
    root?: string;
}

const FileTransformer: Record<string, Function> = {
    '.yaml': YamlFileTransformer,
    '.md': MdFileTransformer,
};

const fixRelativePath = (relativeTo: string) => (path: string) => {
    return join(getAssetsPublicPath(relativeTo), path);
};

export async function resolveMd2HTML(options: ResolverOptions): Promise<ResolveMd2HTMLResult> {
    const {inputPath, fileExtension, outputPath, outputBundlePath, metadata} = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc | null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc && toc.base ? toc.base : '';
    const pathToFileDir: string =
        pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}${sep}`, '');
    const relativePathToIndex = relative(pathToDir, `${tocBase}${sep}`);

    const {input, lang, allowCustomResources} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = await transformFn(content, {path: inputPath});

    const updatedMetadata =
        metadata && metadata.isContributorsEnabled
            ? await getUpdatedMetadata(metadata, content, result?.meta)
            : result.meta;

    const fileMeta = fileExtension === '.yaml' ? result.data.meta ?? {} : updatedMetadata;

    if (allowCustomResources) {
        const {script, style} = metadata?.resources || {};
        fileMeta.style = (fileMeta.style || []).concat(style || []).map(fixRelativePath(inputPath));
        fileMeta.script = (fileMeta.script || [])
            .concat(script || [])
            .map(fixRelativePath(inputPath));
    } else {
        fileMeta.style = [];
        fileMeta.script = [];
    }

    const props = {
        data: {
            leading: inputPath.endsWith('.yaml'),
            toc: transformToc(toc, pathToDir) || {},
            ...result,
            meta: fileMeta,
        },
        router: {
            pathname: join(relativePathToIndex, pathToFileDir, basename(outputPath)),
        },
        lang: lang || Lang.RU,
    };

    const outputDir = dirname(outputPath);
    const relativePathToBundle: string = relative(resolve(outputDir), resolve(outputBundlePath));

    const outputFileContent = generateStaticMarkup(props, relativePathToBundle);
    writeFileSync(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_FINISHED);

    return props;
}

function YamlFileTransformer(content: string): Object {
    let data: LeadingPage | null = null;

    try {
        data = yaml.load(content) as LeadingPage;
    } catch (error) {
        log.error(`Yaml transform has been failed. Error: ${error}`);
    }

    if (!data) {
        return {
            result: {data: {}},
        };
    }

    const links = data?.links?.map((link) =>
        link.href ? {...link, href: link.href.replace(/.md$/gmu, '.html')} : link,
    );

    if (links) {
        data.links = links;
    }

    return {
        result: {data},
    };
}

export function liquidMd2Html(input: string, vars: Record<string, unknown>, path: string) {
    const {conditionsInCode} = ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditionsInCode,
        withSourceMap: true,
    });
}

async function MdFileTransformer(content: string, transformOptions: FileTransformOptions): Promise<Output> {
    const {input, ...options} = ArgvService.getConfig();
    const {path: filePath} = transformOptions;

    const plugins = PluginService.getPlugins();
    const {vars, varsHashList} = getVarsPerFileWithHash(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);

    const cacheKey = cacheServiceMdToHtml.getHashKey({filename: filePath, content, varsHashList});

    const cachedFile = await cacheServiceMdToHtml.checkFileAsync(cacheKey);
    if (cachedFile) {
        logger.info(filePath, CACHE_HIT);
        await cachedFile.extractCacheAsync();
        return cachedFile.getResult<Output>();
    }

    const cacheFile = cacheServiceMdToHtml.createFile(cacheKey);
    const envApi = PluginEnvApi.create({
        root: resolve(input),
        distRoot: resolve(options.output),
        cacheFile,
    });
    const logState = getLogState(log);

    const result = transform(content, {
        ...options,
        plugins: plugins as MarkdownItPluginCb<unknown>[],
        vars,
        root,
        path,
        assetsPublicPath: getAssetsPublicPath(filePath),
        getVarsPerFile: getVarsPerRelativeFile,
        extractTitle: true,
        envApi,
    });

    envApi.executeActions();

    const logIsOk = checkLogWithoutProblems(log, logState);
    if (logIsOk) {
        cacheFile.setResult(result);
        await cacheServiceMdToHtml.addFileAsync(cacheFile);
    }

    return result;
}
