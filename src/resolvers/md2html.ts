import type {DocInnerProps} from '@diplodoc/client';
import type {Run} from '~/commands/build';

import {dirname, extname, join, resolve} from 'node:path';
import {ConfigData, LINK_KEYS, PreloadParams, preprocess} from '@diplodoc/client/ssr';
import {isString} from 'lodash';

import transform, {Output} from '@diplodoc/transform';
import liquid from '@diplodoc/transform/lib/liquid';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import {getPublicPath, isFileExists} from '@diplodoc/transform/lib/utilsFS';

import {isExternalHref} from '~/core/utils';
import {Lang, PROCESSING_FINISHED} from '~/constants';
import {LeadingPage} from '~/models';
import {ArgvService, PluginService, SearchService} from '~/services';
import {mangleFrontMatter} from '~/services/metadata';
import {
    getDepth,
    getLinksWithContentExtersion,
    getVarsPerFile,
    getVarsPerRelativeFile,
    modifyValuesByKeys,
} from '~/utils';
import {generateStaticMarkup} from '~/pages';

export interface FileTransformOptions {
    path: string;
    root: string;
    lang: Lang;
}

const FileTransformer: Record<string, Function> = {
    '.yaml': YamlFileTransformer,
    '.md': MdFileTransformer,
};

const getFileData = async (run: Run, path: RelativePath) => {
    const extension = extname(path);
    const content = await mangleFrontMatter(run, path, extension);

    const transformFn: Function = FileTransformer[extension];
    const {result} = transformFn(content, {path, root: run.input});
    const meta = extension === '.yaml' ? (result?.data?.meta ?? {}) : result.meta;

    run.meta.addResources(path, meta);

    // const fileMeta = fileExtension === '.yaml' ? (result?.data?.meta ?? {}) : result.meta;
    //
    // if (!Array.isArray(fileMeta?.metadata)) {
    //     fileMeta.metadata = [fileMeta?.metadata].filter(Boolean);
    // }

    return {...result, meta: run.meta.dump(path)};
};

const getFileProps = async (run: Run, path: RelativePath) => {
    const {lang: configLang, langs: configLangs, analytics, search} = ArgvService.getConfig();

    const data = await getFileData(run, path);

    const tocBaseLang = path.replace(/\\/g, '/').split('/')[0];
    const tocLang = configLangs?.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || configLangs?.[0] || Lang.RU;
    const langs = configLangs?.length ? configLangs : [lang];

    const pathname = path.replace(extname(path), '');

    return {
        data: {
            ...data,
            title: data.title || data.meta.title || '',
            leading: path.endsWith('.yaml'),
        },
        router: {
            pathname,
            depth: getDepth(path),
        },
        lang,
        langs,
        search: search.enabled ? SearchService.config(lang) : undefined,
        analytics,
    };
};

export async function resolveMd2HTML(run: Run, path: RelativePath): Promise<DocInnerProps> {
    const props = await getFileProps(run, path);
    const output = join(run.output, path.replace(/\.(md|yaml)$/, '.html'));

    const [tocPath, toc] = run.toc.for(path);
    const tocDir = dirname(tocPath);

    const title = getTitle(toc.title as string, props.data.title);
    const tocInfo = {
        content: toc,
        path: join(tocDir, 'toc'),
    };
    const outputFileContent = generateStaticMarkup(props, tocInfo, title);

    await run.write(output, outputFileContent);

    run.logger.info(PROCESSING_FINISHED, path);

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

function YamlFileTransformer(content: object, transformOptions: FileTransformOptions): Object {
    if (!content) {
        return {
            result: {data: {}},
        };
    }

    if (Object.prototype.hasOwnProperty.call(content, 'blocks')) {
        content = modifyValuesByKeys(content, LINK_KEYS, (link) => {
            if (isString(link) && getLinksWithContentExtersion(link)) {
                return link.replace(/.(md|yaml)$/gmu, '.html');
            }

            return link;
        });

        const {path, lang} = transformOptions;
        const transformFn: Function = FileTransformer['.md'];

        content = preprocess(content as ConfigData, {lang} as PreloadParams, (_lang, content) => {
            const {result} = transformFn(content, {path});
            return result?.html;
        });
    } else {
        const links = (content as LeadingPage)?.links?.map((link) => {
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
            (content as LeadingPage).links = links;
        }
    }

    return {
        result: {data: content},
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
