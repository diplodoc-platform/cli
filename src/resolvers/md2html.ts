import {basename, dirname, join, relative, resolve, sep} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@doc-tools/transform';
import log from '@doc-tools/transform/lib/log';
import liquid from '@doc-tools/transform/lib/liquid';

import {ResolverOptions, YfmToc, ResolveMd2HTMLResult, LeadingPage} from '../models';
import {ArgvService, TocService, PluginService} from '../services';
import {generateStaticMarkup, logger, transformToc, getVarsPerFile, getVarsPerRelativeFile} from '../utils';
import {PROCESSING_FINISHED, Lang} from '../constants';
import {getAssetsPublicPath, getUpdatedMetadata} from '../services/metadata';
import {MarkdownItPluginCb} from '@doc-tools/transform/lib/plugins/typings';

export interface FileTransformOptions {
    path: string;
    root?: string;
}

const FileTransformer: Record<string, Function> = {
    '.yaml': YamlFileTransformer,
    '.md': MdFileTransformer,
};

export async function resolveMd2HTML(options: ResolverOptions): Promise<ResolveMd2HTMLResult> {
    const {inputPath, fileExtension, outputPath, outputBundlePath, metadata} = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc|null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc && toc.base ? toc.base : '';
    const pathToFileDir: string = pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}${sep}`, '');
    const relativePathToIndex = relative(pathToDir, `${tocBase}${sep}`);

    const {input, lang, allowCustomResources} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath});

    const updatedMetadata = metadata && metadata.isContributorsEnabled
        ? await getUpdatedMetadata(metadata, content, result?.meta)
        : result.meta;

    let fileMeta = fileExtension === '.yaml' ? result.data.meta : updatedMetadata;

    if (allowCustomResources && metadata?.resources) {
        fileMeta = {...fileMeta, ...metadata?.resources};
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

    const links = data?.links?.map(
        (link) =>
            link.href ? ({...link, href: link.href.replace(/.md$/gmu, '.html')}) : link,
    );

    if (links) { data.links = links; }

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

function MdFileTransformer(content: string, transformOptions: FileTransformOptions): Output {
    const {input, ...options} = ArgvService.getConfig();
    const {path: filePath} = transformOptions;

    const plugins = PluginService.getPlugins();
    const vars = getVarsPerFile(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);


    return transform(content, {
        ...options,
        plugins: plugins as MarkdownItPluginCb<unknown>[],
        vars,
        root,
        path,
        assetsPublicPath: getAssetsPublicPath(filePath),
        getVarsPerFile: getVarsPerRelativeFile,
        extractTitle: true,
    });
}
