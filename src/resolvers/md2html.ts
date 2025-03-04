import type {MarkdownItPluginCb} from '@diplodoc/transform/lib/plugins/typings';
import type {Output} from '@diplodoc/transform';
import type {Run} from '~/commands/build';
import type {Toc} from '~/core/toc';
import type {ResolverResult} from '~/steps';

import {dirname, extname, join} from 'node:path';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';

import {PROCESSING_FINISHED} from '~/constants';
import {ArgvService, PluginService} from '~/services';
import {getDepth, getVarsPerRelativeFile} from '~/utils';
import {generateStaticMarkup} from '~/pages';
import {copyJson, langFromPath} from '~/core/utils';

const getFileData = async (run: Run, path: NormalizedPath) => {
    const extension = extname(path);

    if (extension === '.yaml') {
        // A leading.load has side effects. Do not compute it in parallel with meta.
        const data = await run.leading.dump(path, await run.leading.load(path));
        const meta = await run.meta.dump(path);

        return {data, meta};
    } else {
        const html = await run.markdown.dump(path, await run.markdown.load(path));
        const {title, headings} = await run.markdown.info(path);
        const meta = await run.meta.dump(path);

        // TODO: remove useless fields after snapshotting
        return {meta, assets: [], headings, title, includes: [], html};
    }
};

const getFileProps = async (run: Run, path: NormalizedPath, toc: Toc) => {
    const {langs, analytics, search, staticContent} = run.config;
    const pathname = path.replace(extname(path), '');
    const lang = langFromPath(path, run.config);

    const data = await getFileData(run, path);

    return {
        data: {
            ...data,
            toc: staticContent ? copyJson(toc) : undefined,
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
    const tocPath = run.toc.for(path);
    const toc = await run.toc.dump(tocPath);
    const props = await getFileProps(run, path, toc);

    const tocDir = dirname(tocPath);

    const title = getTitle(toc.title as string, props.data.title);
    const result = generateStaticMarkup(props, join(tocDir, 'toc'), title);

    const outputPath = path.replace(/\.(md|y?aml)$/i, '.html');

    await run.write(join(run.output, outputPath), result);

    run.logger.info(PROCESSING_FINISHED, path);

    return props;
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
