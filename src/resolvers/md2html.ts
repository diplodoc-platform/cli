import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, join, relative, resolve, sep} from 'path';

import type {DocInnerProps} from '@diplodoc/client';
import transform, {Output} from '@diplodoc/transform';
import liquid from '@diplodoc/transform/lib/liquid';
import log from '@diplodoc/transform/lib/log';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import yaml from 'js-yaml';

import {Lang, PROCESSING_FINISHED} from '../constants';
import {LeadingPage, ResolverOptions, YfmToc} from '../models';
import {ArgvService, PluginService, TocService} from '../services';
import {getAssetsPublicPath, getVCSMetadata} from '../services/metadata';
import {
    generateStaticMarkup,
    getVarsPerFile,
    getVarsPerRelativeFile,
    logger,
    transformToc,
} from '../utils';


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

const getFileMeta = async ({
    fileExtension,
    metadata,
    inputPath,
}: ResolverOptions) => {
    const { input, allowCustomResources } = ArgvService.getConfig();

    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const { result } = transformFn(content, { path: inputPath });
    
    const vars = getVarsPerFile(inputPath);
    const updatedMetadata = metadata?.isContributorsEnabled
        ? await getVCSMetadata(metadata, content, result?.meta)
        : result?.meta;
    const fileMeta = fileExtension === '.yaml'
        ? (result?.data?.meta ?? {})
        : updatedMetadata;

    if (!Array.isArray(fileMeta?.metadata)) {
        fileMeta.metadata = [fileMeta?.metadata].filter(Boolean);
    }

    fileMeta.metadata = fileMeta.metadata.concat(vars.__metadata?.filter(Boolean) || []);

    if (allowCustomResources) {
        const { script, style } = metadata?.resources ?? {};
        fileMeta.style = (fileMeta.style ?? []).concat(style || []).map(fixRelativePath(inputPath));
        fileMeta.script = (fileMeta.script ?? [])
            .concat(script ?? [])
            .map(fixRelativePath(inputPath));
    } else {
        fileMeta.style = [];
        fileMeta.script = [];
    }

    return { ...result, meta: fileMeta };
}

const getFileProps = async (options: ResolverOptions) => {
    const { inputPath, outputPath } = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc | null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc?.base ?? '';
    const pathToFileDir: string =
        pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}${sep}`, '');
    const relativePathToIndex = relative(pathToDir, `${tocBase}${sep}`);

    const {
        lang: configLang,
        langs: configLangs,
    } = ArgvService.getConfig();
    const meta = await getFileMeta(options);

    const tocBaseLang = tocBase?.split('/')[0];
    const tocLang = configLangs?.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = configLang || tocLang || Lang.RU;
    const langs = configLangs?.length ? configLangs : [lang];

    const props = {
        data: {
            leading: inputPath.endsWith('.yaml'),
            toc: transformToc(toc, pathToDir) || {},
            ...meta,
        },
        router: {
            pathname: join(relativePathToIndex, pathToFileDir, basename(outputPath)),
        },
        lang,
        langs,
    };

    return props;
}

export async function resolveMd2HTML(options: ResolverOptions): Promise<DocInnerProps> {
    const { outputPath, outputBundlePath, inputPath } = options;
    const props = await getFileProps(options);

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
