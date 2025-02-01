import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import type {ConfigData, PreloadParams} from '@diplodoc/client/ssr';
import type {Output} from '@diplodoc/transform';
import type {Run} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {ResolverResult} from '~/steps';

import {dirname, extname, join} from 'node:path';
import {preprocess} from '@diplodoc/client/ssr';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';

import {Lang, PROCESSING_FINISHED} from '~/constants';
import {ArgvService, PluginService} from '~/services';
import {getDepth, getVarsPerRelativeFile, mangleFrontMatter} from '~/utils';
import {generateStaticMarkup} from '~/pages';

const identity = (yaml: LeadingPage) => yaml;

const getFileData = async (run: Run, path: NormalizedPath, lang: string) => {
    const extension = extname(path);
    const vars = await run.vars.load(path);

    if (extension === '.yaml') {
        const leading = await run.leading.dump(path, identity);
        // This is not a part of leading.dump because this makes leading unserializable
        const result = transformYaml(run, path, leading, vars, lang);

        return {
            ...result,
            meta: await run.meta.dump(path),
        };
    }

    const content = await mangleFrontMatter(run, path);
    const {result} = transformMd(run, path, content, vars, lang);

    run.meta.add(path, result.meta || {}, true);

    return {
        ...result,
        meta: await run.meta.dump(path),
    };
};

const getFileProps = async (run: Run, path: NormalizedPath) => {
    const {lang: configLang, langs, analytics, search} = run.config;
    const pathname = path.replace(extname(path), '');

    const tocBaseLang = path.split('/')[0];
    const tocLang = langs.includes(tocBaseLang as Lang) && tocBaseLang;

    const lang = tocLang || configLang || langs?.[0] || Lang.RU;

    const data = await getFileData(run, path, lang);

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
        search: search.enabled ? run.search.config(lang) : undefined,
        analytics,
    };
};

export async function resolveToHtml(run: Run, path: NormalizedPath): Promise<ResolverResult> {
    const props = await getFileProps(run, path);

    const tocPath = run.toc.for(path);
    const toc = (await run.toc.dump(tocPath)) as Toc;
    const tocDir = dirname(tocPath);

    const title = getTitle(toc.title as string, props.data.title);
    const tocInfo = {
        content: toc,
        path: join(tocDir, 'toc'),
    };
    const result = generateStaticMarkup(props, tocInfo, title);

    run.logger.info(PROCESSING_FINISHED, path);

    return {result, info: props};
}

function getTitle(tocTitle: string, dataTitle: string) {
    if (dataTitle && tocTitle) {
        return `${dataTitle} | ${tocTitle}`;
    }

    return tocTitle || dataTitle || '';
}

function transformYaml(
    run: Run,
    path: NormalizedPath,
    content: LeadingPage,
    vars: Hash,
    lang: string,
) {
    if (!content) {
        return {data: {} as LeadingPage};
    }

    if (content.blocks) {
        content = preprocess(content as ConfigData, {lang} as PreloadParams, (_lang, content) => {
            const {result} = transformMd(run, path, content, vars, lang);
            return result?.html;
        });
    }

    return {data: content};
}

function transformMd(
    run: Run,
    path: RelativePath,
    content: string,
    vars: Hash,
    lang: string,
): Output {
    const options = ArgvService.getConfig();
    const plugins = PluginService.getPlugins();

    return transform(content, {
        ...options,
        plugins: plugins as MarkdownItPluginCb<unknown>[],
        vars,
        root: run.input,
        path: join(run.input, path),
        lang,
        assetsPublicPath: './',
        getVarsPerFile: getVarsPerRelativeFile,
        getPublicPath,
        extractTitle: true,
        log: run.logger,
    });
}
