import {FileMetaMap} from '../../types';
import yaml from 'js-yaml';
import {DocInnerProps, DocPageData, LINK_KEYS, preprocess} from '@diplodoc/client/ssr';
import {isString} from 'lodash';
import transform from '@diplodoc/transform';
import {MarkdownItPluginCb} from '@diplodoc/transform/lib/typings';
import path from 'node:path';
import {getPublicPath, isFileExists} from '@diplodoc/transform/lib/utilsFS';
import * as fs from 'node:fs';
import GithubConnector from '../vcs/github';
import {transformYaml} from './transformYaml';
import {BuildConfig, Run} from '~/commands/build';
import {PresetIndex} from '~/reCli/components/presets/types';
import {TocIndexMap} from '../toc/types';
import {getLinksWithContentExtersion, modifyValuesByKeys} from '~/utils';
import {getPageToc} from '../toc/utils';
import {cachedMkdir, safePath} from '~/reCli/utils';
import {Lang} from '~/constants';
import {LeadingPage} from '~/models';
import {getFilePresets} from '~/reCli/components/presets';
import {getPlugins} from '~/reCli/utils/plugins';
import {generateStaticMarkup} from '~/reCli/components/render/document';
import {LogCollector} from '~/reCli/utils/logger';
import {legacyConfig as legacyConfigFn} from '~/commands/build/legacy-config';
import {isExternalHref} from '~/core/utils';

/*eslint-disable no-console*/

interface PageToHtmlProps {
    run: Run;
    options: BuildConfig;
    cwd: string;
    targetCwd: string;
    presetIndex: PresetIndex;
    fileMetaMap: FileMetaMap;
    vcsConnector?: GithubConnector;
    tocIndex: TocIndexMap;
    logger: LogCollector;
}

export async function pageToHtml(props: PageToHtmlProps, pagePath: string) {
    const {targetCwd, tocIndex, logger, options} = props;
    const fileProps = (await getFileProps(props, pagePath)) as DocInnerProps<DocPageData>;

    const {toc, tocPath} = getPageToc(tocIndex, pagePath);
    if (!toc || !tocPath) {
        throw new Error('Page toc not found');
    }

    const title = getTitle(
        toc.title as string | undefined,
        fileProps.data.meta.title || fileProps.data.title,
    );
    const tocInfo = {
        content: toc,
        path: path.join(path.dirname(tocPath), 'toc'),
    };
    const outputFileContent = generateStaticMarkup(options, fileProps, tocInfo, title);
    const htmlPagePath = path.join(
        path.dirname(pagePath),
        `${path.basename(pagePath, path.extname(pagePath))}.html`,
    );
    const outputPath = path.join(targetCwd, htmlPagePath);
    await cachedMkdir(path.dirname(outputPath));
    await fs.promises.writeFile(outputPath, outputFileContent);

    logger.info(`Html ${pagePath}`);

    return fileProps;
}

async function getFileProps(props: PageToHtmlProps, pagePath: string) {
    const {lang: configLang, langs: configLangs = []} = props.options;

    const data = await getFileData(props, pagePath);

    const tocBaseLang = pagePath.split('/')[0];
    const tocLang = configLangs.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || configLangs[0] || Lang.RU;
    const langs = configLangs.length ? configLangs : [lang];

    const pathname = path.join(
        path.dirname(pagePath),
        path.basename(pagePath, path.extname(pagePath)),
    );

    return {
        data: {
            ...data,
            title: ('title' in data && data.title) || '',
            leading: pagePath.endsWith('.yaml'),
        },
        router: {
            pathname,
            depth: getDepth(pagePath),
        },
        lang,
        langs,
    };
}

async function getFileData(props: PageToHtmlProps, pagePath: string) {
    const {cwd, fileMetaMap, vcsConnector, options, presetIndex} = props;
    const {allowCustomResources, resources, vars} = options;
    const combinedVars = getFilePresets(presetIndex, vars, pagePath);

    const pageContent: string = await fs.promises.readFile(
        path.join(cwd, safePath(pagePath)) as AbsolutePath,
        'utf8',
    );

    const transformFn = path.extname(pagePath) === '.md' ? mdFileTransformer : yamlFileTransformer;
    const {result} = transformFn(
        {
            ...props,
            pagePath,
        },
        pageContent,
    );

    let fileMeta;
    if (path.extname(pagePath) === '.md') {
        fileMeta = vcsConnector ? fileMetaMap.get(pagePath) : 'meta' in result && result?.meta;
    } else {
        // @ts-ignore
        fileMeta = (result && 'data' in result && result.data.meta) ?? {};
    }

    if (fileMeta?.metadata && !Array.isArray(fileMeta.metadata)) {
        fileMeta.metadata = [fileMeta.metadata];
    }

    if (Array.isArray(combinedVars.__metadata)) {
        fileMeta.metadata = [
            ...(fileMeta.metadata ?? []),
            ...combinedVars.__metadata.filter(Boolean),
        ];
    }

    if (allowCustomResources) {
        if (resources) {
            Object.entries(resources).forEach(([key, value = []]) => {
                fileMeta[key] = (fileMeta[key] ?? []).concat(value);
            });
        }
    } else {
        fileMeta.style = [];
        fileMeta.script = [];
        fileMeta.csp = [];
    }

    return {...result, meta: fileMeta};
}

interface YamlFileTransformerOptions extends PageToHtmlProps {
    pagePath: string;
}

function yamlFileTransformer(props: YamlFileTransformerOptions, pageContent: string) {
    const {cwd, pagePath, logger, options, run} = props;
    const legacyConfig = legacyConfigFn(run);
    const {resolveConditions} = legacyConfig;

    let data;
    try {
        data = yaml.load(pageContent) as LeadingPage;
    } catch (err) {
        const error = err as Error;
        logger.error(`${pagePath} Yaml transform has been failed. Error: ${error.stack}`);
    }

    if (!data) {
        return {
            result: {data: {}},
        };
    }

    if (resolveConditions && path.basename(pagePath) === 'index.yaml') {
        data = transformYaml(data, props, pagePath);
    }

    if (Object.prototype.hasOwnProperty.call(data, 'blocks')) {
        data = modifyValuesByKeys(data, LINK_KEYS, (link) => {
            if (isString(link) && getLinksWithContentExtersion(link)) {
                return link.replace(/.(md|yaml)$/gmu, '.html');
            }

            return link;
        });

        const {lang} = options;

        data = preprocess(
            data,
            {lang, pageName: path.basename(pagePath)},
            (_lang: string, contentLocal: string) => {
                const {result} = mdFileTransformer(props, contentLocal);
                return result?.html;
            },
        );
    } else {
        const links = data?.links?.map((link) => {
            if (link.href) {
                const href = getHref(cwd, pagePath, link.href);
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

interface MdFileTransformerOptions extends PageToHtmlProps {
    pagePath: string;
}

function mdFileTransformer(props: MdFileTransformerOptions, pageContent: string) {
    const {presetIndex, pagePath, cwd, logger, run} = props;
    const legacyConfig = legacyConfigFn(run);
    const {vars, allowHTML, conditionsInCode, disableLiquid, needToSanitizeHtml, lang} =
        legacyConfig;
    const combinedVars = getFilePresets(presetIndex, vars, pagePath);
    const plugins = getPlugins();

    return transform(pageContent, {
        conditionsInCode,
        disableLiquid,
        needToSanitizeHtml,
        allowHTML,
        log: logger,
        lang,
        plugins: plugins as MarkdownItPluginCb[],
        vars: combinedVars as Record<string, string>,
        root: cwd,
        path: path.join(cwd, safePath(pagePath)),
        assetsPublicPath: './',
        getVarsPerFile: (absPagePathLocal: string) => {
            const subFilepath = path.relative(cwd, absPagePathLocal);
            return getFilePresets(presetIndex, vars, subFilepath);
        },
        getPublicPath,
        extractTitle: true,
    });
}

function getHref(cwd: string, filepath: string, rawHref: string) {
    if (isExternalHref(rawHref)) {
        return rawHref;
    }

    let href = rawHref;

    if (!href.startsWith('/')) {
        href = path.join(path.dirname(filepath), href);
    }

    const fullPagePath = path.join(cwd, safePath(href));

    if (isFileExists(fullPagePath) || isFileExists(fullPagePath + '.md')) {
        href = href.replace(/\.(md|ya?ml)$/gi, '.html');
    } else if (!/.+\.\w+$/gi.test(href)) {
        href = href + (href.endsWith('/') ? '' : '/') + 'index.html';
    }

    return href;
}

function getDepth(pagePath: string) {
    return pagePath
        .replace(/\\/g, '/')
        .replace(/^\.\/|\/$/g, '')
        .split('/').length;
}

function getTitle(tocTitle: string | undefined, dataTitle: string | undefined) {
    if (dataTitle && tocTitle) {
        return `${dataTitle} | ${tocTitle}`;
    }

    return tocTitle || dataTitle || '';
}
