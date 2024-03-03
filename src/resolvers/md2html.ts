import {basename, dirname, join, relative, resolve, sep} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import yaml from 'js-yaml';

import transform, {Output} from '@diplodoc/transform';
import log from '@diplodoc/transform/lib/log';
import liquid from '@diplodoc/transform/lib/liquid';

import {LeadingPage, ResolveMd2HTMLResult, ResolverOptions, YfmToc} from '../models';
import {ArgvService, PluginService, TocService} from '../services';
import {
    generateStaticMarkup,
    getVarsPerFile,
    getVarsPerRelativeFile,
    logger,
    transformToc,
} from '../utils';
import {Lang, PROCESSING_FINISHED} from '../constants';
import {getAssetsPublicPath, getVCSMetadata} from '../services/metadata';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';

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
    const vars = getVarsPerFile(inputPath);

    const {input, lang, langs, allowCustomResources} = ArgvService.getConfig();
    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath});

    const updatedMetadata = metadata?.isContributorsEnabled
        ? await getVCSMetadata(metadata, content, result?.meta)
        : result.meta;

    const fileMeta = fileExtension === '.yaml' ? result.data.meta ?? {} : updatedMetadata;

    if (!Array.isArray(fileMeta?.metadata)) {
        fileMeta.metadata = [fileMeta?.metadata].filter(Boolean);
    }

    fileMeta.metadata = fileMeta.metadata.concat(vars.__metadata?.filter(Boolean) || []);

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

    const tocBaseLang = tocBase?.split('/')[0];
    const tocLang = langs?.includes(tocBaseLang) && tocBaseLang;

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
        lang: lang || tocLang || Lang.RU,
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
