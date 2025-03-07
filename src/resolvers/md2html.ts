import type {DocInnerProps} from '@diplodoc/client';
import type {Run} from '~/commands/build';
import type {Toc} from '~/core/toc';

import {readFileSync, writeFileSync} from 'fs';
import {dirname, extname, join, resolve} from 'path';
import {ConfigData, LINK_KEYS, PreloadParams, preprocess} from '@diplodoc/client/ssr';
import {isString} from 'lodash';

import transform, {Output} from '@diplodoc/transform';
import liquid from '@diplodoc/transform/lib/liquid';
import log from '@diplodoc/transform/lib/log';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import {getPublicPath, isFileExists} from '@diplodoc/transform/lib/utilsFS';
import yaml from 'js-yaml';

import {Lang, PROCESSING_FINISHED} from '../constants';
import {LeadingPage, ResolverOptions} from '../models';
import {ArgvService, PluginService} from '../services';
import {getVCSMetadata} from '../services/metadata';
import {
    getDepth,
    getLinksWithContentExtersion,
    getVarsPerFile,
    getVarsPerRelativeFile,
    logger,
    modifyValuesByKeys,
} from '../utils';
import {isExternalHref} from '~/core/utils';
import {generateStaticMarkup} from '../pages';

export interface FileTransformOptions {
    path: string;
    root: string;
    lang: Lang;
}

const FileTransformer: Record<string, Function> = {
    '.yaml': YamlFileTransformer,
    '.md': MdFileTransformer,
};

const getFileData = async ({fileExtension, metadata, inputPath}: ResolverOptions) => {
    const {input, allowCustomResources} = ArgvService.getConfig();

    const resolvedPath: string = resolve(input, inputPath);
    const content: string = readFileSync(resolvedPath, 'utf8');

    const transformFn: Function = FileTransformer[fileExtension];
    const {result} = transformFn(content, {path: inputPath, root: input});

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
        const {script, style, csp} = metadata?.resources || {};
        fileMeta.style = (fileMeta.style || []).concat(style || []);
        fileMeta.script = (fileMeta.script || []).concat(script || []);
        fileMeta.csp = (fileMeta.csp || []).concat(csp || []);
    } else {
        fileMeta.style = [];
        fileMeta.script = [];
        fileMeta.csp = [];
    }

    return {...result, meta: fileMeta};
};

const getFileProps = async (run: Run, options: ResolverOptions) => {
    const {inputPath} = options;
    const {lang: configLang, langs: configLangs, analytics, search} = ArgvService.getConfig();

    const data = await getFileData(options);

    const tocBaseLang = inputPath.replace(/\\/g, '/').split('/')[0];
    const tocLang = configLangs?.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || configLangs?.[0] || Lang.RU;
    const langs = configLangs?.length ? configLangs : [lang];

    const pathname = inputPath.replace(extname(inputPath), '');

    return {
        data: {
            ...data,
            title: data.title || data.meta.title || '',
            leading: inputPath.endsWith('.yaml'),
        },
        router: {
            pathname,
            depth: getDepth(inputPath),
        },
        lang,
        langs,
        search: search.enabled ? run.search.config(lang) : undefined,
        analytics,
    };
};

export async function resolveMd2HTML(run: Run, options: ResolverOptions): Promise<DocInnerProps> {
    const {outputPath, inputPath} = options;
    const props = await getFileProps(run, options);

    const tocPath = run.toc.for(inputPath);
    const toc = (await run.toc.dump(tocPath)) as Toc;
    const tocDir = dirname(tocPath);

    const title = getTitle(toc.title as string, props.data.title);
    const tocInfo = {
        content: toc,
        path: join(tocDir, 'toc'),
    };
    const outputFileContent = generateStaticMarkup(props, tocInfo, title);
    writeFileSync(outputPath, outputFileContent);
    logger.info(inputPath, PROCESSING_FINISHED);

    return props;
}

function getTitle(tocTitle: string, dataTitle: string) {
    if (dataTitle && tocTitle) {
        return `${dataTitle} | ${tocTitle}`;
    }

    return tocTitle || dataTitle || '';
}

function getHref(root: string, path: string, href: string) {
    if (isExternalHref(href)) {
        return href;
    }

    if (!href.startsWith('/')) {
        href = join(dirname(path), href);
    }

    const filePath = resolve(root, href);

    if (isFileExists(filePath) || isFileExists(filePath + '.md')) {
        href = href.replace(/\.(md|ya?ml)$/gi, '.html');
    } else if (!/.+\.\w+$/gi.test(href)) {
        // TODO: isFileExists index.md or index.yaml
        href = href + (href.endsWith('/') ? '' : '/') + 'index.html';
    }

    return href;
}

function YamlFileTransformer(content: string, transformOptions: FileTransformOptions): Object {
    let data;

    try {
        data = yaml.load(content);
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

            return link;
        });

        const {path, lang} = transformOptions;
        const transformFn: Function = FileTransformer['.md'];

        data = preprocess(data as ConfigData, {lang} as PreloadParams, (_lang, content) => {
            const {result} = transformFn(content, {path});
            return result?.html;
        });
    } else {
        const links = (data as LeadingPage)?.links?.map((link) => {
            if (link.href) {
                const {root, path} = transformOptions;
                const href = getHref(root, path, link.href);
                return {
                    ...link,
                    href,
                };
            }
            return link;
        });

        if (links) {
            (data as LeadingPage).links = links;
        }
    }

    return {
        result: {data},
    };
}

export function liquidMd2Html(input: string, vars: Record<string, unknown>, path: string) {
    const {conditionsInCode, useLegacyConditions} = ArgvService.getConfig();

    return liquid(input, vars, path, {
        conditionsInCode,
        withSourceMap: true,
        useLegacyConditions,
    });
}

function MdFileTransformer(content: string, transformOptions: FileTransformOptions): Output {
    const {input, ...options} = ArgvService.getConfig();
    const {path: filePath} = transformOptions;

    const plugins = PluginService.getPlugins();
    const vars = getVarsPerFile(filePath);
    const root = resolve(input);
    const path = resolve(input, filePath);

    return transform(content, {
        ...options,
        plugins: plugins as MarkdownItPluginCb<unknown>[],
        vars,
        root,
        path,
        assetsPublicPath: './',
        getVarsPerFile: getVarsPerRelativeFile,
        getPublicPath,
        extractTitle: true,
    });
}
