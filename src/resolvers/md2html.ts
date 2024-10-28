import {basename, dirname, join, resolve, sep} from 'path';
import {isString} from 'lodash';
import yaml from 'js-yaml';

import type {DocInnerProps} from '@diplodoc/client';
import {LINK_KEYS, preprocess} from '@diplodoc/client/ssr';
import transform, {Output} from '@diplodoc/transform';
import liquid from '@diplodoc/transform/lib/liquid';
import log from '@diplodoc/transform/lib/log';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import {getPublicPath, isFileExists} from '@diplodoc/transform/lib/utilsFS';

import {Lang, PROCESSING_FINISHED} from '~/constants';
import {LeadingPage, ResolverOptions, YfmToc} from '~/models';
import {ArgvService, PluginService, SearchService, TocService} from '~/services';
import {getAssetsPublicPath, getAssetsRootPath, getVCSMetadata} from '~/services/metadata';
import {
    getLinksWithContentExtersion,
    getVarsPerFile,
    getVarsPerRelativeFile,
    logger,
    modifyValuesByKeys,
    transformToc,
} from '../utils';
import {RevisionContext} from '~/context/context';
import {DependencyContext, FsContext} from '@diplodoc/transform/lib/typings';
import {generateStaticMarkup} from '~/pages';

export interface FileTransformOptions {
    lang: string;
    path: string;
    root?: string;
    fs: FsContext;
    context: RevisionContext;
    deps: DependencyContext;
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
    context,
    fs,
    deps,
}: ResolverOptions) => {
    const {input, allowCustomResources} = ArgvService.getConfig();

    const resolvedPath: string = resolve(input, inputPath);
    const content: string = await fs.readAsync(resolvedPath);

    const transformFn: Function = FileTransformer[fileExtension];

    const {result} = await transformFn(content, {path: inputPath, context, fs, deps});

    const vars = getVarsPerFile(inputPath);
    const updatedMetadata = metadata?.isContributorsEnabled
        ? await getVCSMetadata(metadata, content, result?.meta)
        : result?.meta;
    const fileMeta = fileExtension === '.yaml' ? (result?.data?.meta ?? {}) : updatedMetadata;

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

    return {...result, meta: fileMeta};
};

const getFileProps = async (options: ResolverOptions) => {
    const {inputPath, outputPath} = options;

    const pathToDir: string = dirname(inputPath);
    const toc: YfmToc | null = TocService.getForPath(inputPath) || null;
    const tocBase: string = toc?.root?.base || toc?.base || '';
    const pathToFileDir: string =
        pathToDir === tocBase ? '' : pathToDir.replace(`${tocBase}${sep}`, '');

    const {lang: configLang, langs: configLangs, analytics, search} = ArgvService.getConfig();
    const meta = await getFileMeta(options);

    const tocBaseLang = tocBase?.split('/')[0];
    const tocLang = configLangs?.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || configLangs?.[0] || Lang.RU;
    const langs = configLangs?.length ? configLangs : [lang];

    const pathname = join(pathToFileDir, basename(outputPath));

    const props = {
        data: {
            leading: inputPath.endsWith('.yaml'),
            toc: transformToc(toc) || {},
            ...meta,
        },
        router: {
            pathname,
            depth: inputPath.replace(/\\/g, '/').split('/').length,
        },
        lang,
        langs,
        search: search
            ? {
                  ...(search === true ? {provider: 'local'} : search),
                  ...SearchService.config(lang),
              }
            : undefined,
        analytics,
    };

    return props;
};

export async function resolveMd2HTML(options: ResolverOptions): Promise<DocInnerProps> {
    const {outputPath, inputPath, deep, deepBase, fs} = options;
    const props = await getFileProps(options);

    const outputFileContent = generateStaticMarkup(props, deepBase, deep);
    fs.write(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_FINISHED);

    return props;
}

function getHref(path: string, href: string) {
    if (!href.includes('//')) {
        const {input} = ArgvService.getConfig();
        const root = resolve(input);
        const assetRootPath = getAssetsRootPath(path) || '';

        let filePath = resolve(input, dirname(path), href);

        if (href.startsWith('/')) {
            filePath = resolve(input, assetRootPath, href.replace(/^\/+/gi, ''));
        }

        href = getPublicPath(
            {
                root,
                rootPublicPath: assetRootPath,
            },
            filePath,
        );

        if (isFileExists(filePath) || isFileExists(filePath + '.md')) {
            href = href.replace(/\.md$/gi, '.html');
        } else if (!/.+\.\w+$/gi.test(href)) {
            href = href + '/';
        }
    }
    return href;
}

async function YamlFileTransformer(
    content: string,
    transformOptions: FileTransformOptions,
): Object {
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

        data = await preprocess(data, {lang}, (lang, content) => {
            const {result} = transformFn(content, {path});
            return result?.html;
        });
    } else {
        const links = data?.links?.map((link) => {
            if (link.href) {
                const href = getHref(transformOptions.path, link.href);
                return {
                    ...link,
                    href,
                };
            }
            return link;
        });

        if (links) {
            data.links = links;
        }
    }

    return {
        result: {data},
    };
}

export async function liquidMd2Html(input: string, vars: Record<string, unknown>, path: string) {
    const {conditionsInCode, useLegacyConditions} = ArgvService.getConfig();

    return await liquid(input, vars, path, {
        conditionsInCode,
        withSourceMap: true,
        useLegacyConditions,
    });
}

async function MdFileTransformer(content: string, transformOptions: FileTransformOptions): Output {
    const {input, ...options} = ArgvService.getConfig();
    const {path: filePath, context, fs, deps} = transformOptions;

    const plugins = PluginService.getPlugins();
    const vars = getVarsPerFile(filePath);
    const root = resolve(input);
    const path: string = resolve(input, filePath);

    return await transform(content, {
        ...options,
        plugins: plugins as MarkdownItPluginCb[],
        vars,
        root,
        path,
        assetsPublicPath: getAssetsPublicPath(filePath),
        rootPublicPath: getAssetsRootPath(filePath),
        getVarsPerFile: getVarsPerRelativeFile,
        getPublicPath,
        extractTitle: true,
        context,
        fs,
        deps,
    });
}
