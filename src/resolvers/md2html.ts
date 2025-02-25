import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import type {Output} from '@diplodoc/transform';
import type {Run} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {LeadingPage} from '~/core/leading';
import type {ResolverResult} from '~/steps';

import {dirname, extname, join} from 'node:path';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';

import {Lang, PROCESSING_FINISHED} from '~/constants';
import {ArgvService, PluginService} from '~/services';
import {getDepth, getVarsPerRelativeFile, mangleFrontMatter} from '~/utils';
import {generateStaticMarkup} from '~/pages';
import {langFromPath} from '~/core/utils';

const getFileData = async (run: Run, path: NormalizedPath, lang: string) => {
    const extension = extname(path);

    if (extension === '.yaml') {
        // A leading.dump has side effects. Do not compute it in parallel with meta.
        const data = await run.leading.dump<LeadingPage>(path);
        const meta = await run.meta.dump(path);

        return {data, meta};
    }

    const vars = await run.vars.load(path);
    const content = await mangleFrontMatter(run, path);
    const {result} = transformMd(run, path, content, vars, lang);

    run.meta.add(path, result.meta || {}, true);

    return {
        ...result,
        meta: await run.meta.dump(path),
    };
};

const getFileProps = async (run: Run, path: NormalizedPath) => {
    const {langs, analytics, search} = run.config;
    const pathname = path.replace(extname(path), '');
    const lang = langFromPath(path, run.config);

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

export function transformMd(
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
