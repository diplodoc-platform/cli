import {readFileSync, writeFileSync} from 'fs';
import {basename, dirname, join, resolve, sep} from 'path';
import {LINK_KEYS, preprocess} from '@diplodoc/client/ssr';
import {isString} from 'lodash';

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
    getLinksWithContentExtersion,
    getVarsPerFile,
    getVarsPerRelativeFile,
    logger,
    modifyValuesByKeys,
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

const getFileMeta = async ({fileExtension, metadata, inputPath}: ResolverOptions) => {
    const {input, allowCustomResources} = ArgvService.getConfig();

    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath});

    const vars = getVarsPerFile(inputPath);
    const updatedMetadata = metadata?.isContributorsEnabled
        ? await getVCSMetadata(metadata, content, result?.meta)
        : result?.meta;
    const fileMeta = fileExtension === '.yaml' ? result?.data?.meta ?? {} : updatedMetadata;

    if (!Array.isArray(fileMeta?.metadata)) {
        fileMeta.metadata = [fileMeta?.metadata].filter(Boolean);
    }

    fileMeta.metadata = fileMeta.metadata.concat(vars.__metadata?.filter(Boolean) || []);

    if (allowCustomResources) {
        const {script, style} = metadata?.resources || {};
        fileMeta.style = (fileMeta.style || []).concat(style || []);
        fileMeta.script = (fileMeta.script || [])
            .concat(script || []);
    } else {
        fileMeta.style = [];
        fileMeta.script = [];
    }

    return {...result, meta: fileMeta};
};

const getFileProps = async (options: ResolverOptions) => {
    const {inputPath, outputPath} = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc | null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc?.base ?? '';
    const pathToFileDir: string =
        pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}${sep}`, '');

    const {lang: configLang, langs: configLangs} = ArgvService.getConfig();
    const meta = await getFileMeta(options);

    const tocBaseLang = tocBase?.split('/')[0];
    const tocLang = configLangs?.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || Lang.RU;
    const langs = configLangs?.length ? configLangs : [lang];

    const props = {
        data: {
            leading: inputPath.endsWith('.yaml'),
            toc: transformToc(toc) || {},
            ...meta,
        },
        router: {
            pathname: join(pathToFileDir, basename(outputPath)),
        },
        lang,
        langs,
    };

    return props;
};

export async function resolveMd2HTML(options: ResolverOptions): Promise<DocInnerProps> {
    const {outputPath, inputPath, deep, deepBase} = options;
    const props = await getFileProps(options);

    const outputFileContent = generateStaticMarkup(props, deepBase, deep);
    writeFileSync(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_FINISHED);

    return props;
}

function YamlFileTransformer(content: string, transformOptions: FileTransformOptions): Object {
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

    if (Object.prototype.hasOwnProperty.call(data, 'blocks')) {
        data = modifyValuesByKeys(data, LINK_KEYS, (link) => {
            if (isString(link) && getLinksWithContentExtersion(link)) {
                return link.replace(/.(md|yaml)$/gmu, '.html');
            }
        });

        const {path, lang} = transformOptions;
        const transformFn: Function = FileTransformer['.md'];

        data = preprocess(data, {lang}, (lang, content) => {
            const {result} = transformFn(content, {path});
            return result?.html;
        });
    } else {
        const links = data?.links?.map((link) =>
            link.href ? {...link, href: link.href.replace(/.md$/gmu, '.html')} : link,
        );

        if (links) {
            data.links = links;
        }
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
