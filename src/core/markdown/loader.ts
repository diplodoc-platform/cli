import type {LiquidContext, SourceMap} from '@diplodoc/liquid';
import type {Meta} from '~/core/meta';
import type {Logger} from '~/core/logger';
import type {
    AdditionalInfo,
    AssetInfo,
    CollectPlugin,
    HeadingInfo,
    IncludeInfo,
    TransformPlugin,
} from './types';

import {join} from 'node:path';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {extractFrontMatter, liquidJson, liquidSnippet} from '@diplodoc/liquid';

import {isMediaLink, parseLocalUrl} from '~/core/utils';

import {rebasePath} from './utils';

export enum TransformMode {
    Html = 'html',
    Md = 'md',
}

type LoaderContextBase = LiquidContext & {
    root: AbsolutePath;
    path: NormalizedPath;
    vars: Hash;
    lang: string;
    logger: Logger;
    emitFile(path: NormalizedPath, content: string): Promise<void>;
    emitAsset(path: NormalizedPath): Promise<void>;
    markdown: {
        setDependencies(path: NormalizedPath, deps: IncludeInfo[]): void;
        setAssets(path: NormalizedPath, assets: AssetInfo[]): void;
        setMeta(path: NormalizedPath, meta: Meta): void;
        setHeadings(path: NormalizedPath, headings: HeadingInfo[]): void;
        setInfo(path: NormalizedPath, info: AdditionalInfo): void;
    };
    sourcemap: SourceMap;
    options: {
        rootInput: AbsolutePath;
        allowHTML: boolean;
        needToSanitizeHtml: boolean;
        supportGithubAnchors: boolean;

        disableLiquid: boolean;

        lintDisabled: boolean;
        // @ts-ignore
        lintConfig: Hash;
    };
};

export type LoaderContext = LoaderContextBase &
    (
        | {
              mode: TransformMode.Md;
              plugins: CollectPlugin[];
          }
        | {
              mode: TransformMode.Html;
              plugins: TransformPlugin[];
          }
    );

export async function loader(this: LoaderContext, content: string) {
    content = mangleFrontMatter.call(this, content);
    content = stripComments.call(this, content);
    content = templateContent.call(this, content);
    content = await applyPlugins.call(this, content);
    content = resolveDependencies.call(this, content);
    content = resolveAssets.call(this, content);
    content = resolveHeadings.call(this, content);
    // content = await replaceTitleRefs.call(this, content);

    return content;
}

function mangleFrontMatter(this: LoaderContext, rawContent: string) {
    const {path, vars, options} = this;
    const {disableLiquid} = options;

    const [frontmatter, content, rawFrontmatter] = extractFrontMatter(rawContent);

    if (!rawFrontmatter) {
        this.markdown.setMeta(path, {});
        return rawContent;
    }

    if (!disableLiquid) {
        this.markdown.setMeta(path, liquidJson.call(this, frontmatter, vars));
    } else {
        this.markdown.setMeta(path, frontmatter);
    }

    this.sourcemap.delete(1, rawFrontmatter);

    return content;
}

function stripComments(this: LoaderContext, content: string) {
    const lines = this.sourcemap.lines(content);

    const COMMENTS_CONTENTS = /<!-{2,}[\s\S]*?-{2,}>\r?\n?/g;

    const points = [];
    const comments = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = COMMENTS_CONTENTS.exec(content))) {
        points.push(this.sourcemap.location(match.index, COMMENTS_CONTENTS.lastIndex, lines));
        comments.push([match.index, COMMENTS_CONTENTS.lastIndex]);
    }

    this.sourcemap.patch({
        delete: points,
    });

    return comments.reduceRight((content, [start, end]) => {
        return content.slice(0, start) + content.slice(end);
    }, content);
}

function templateContent(this: LoaderContext, content: string) {
    const {vars, options} = this;
    const {disableLiquid} = options;

    if (disableLiquid) {
        return content;
    }

    const result = liquidSnippet.call(this, content, vars, this.sourcemap);

    return result;
}

function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    const lines = this.sourcemap.lines(content);

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const INCLUDE_CONTENTS = /{%\s*include\s.+?%}/g;
    // Include example: [createfolder](create-folder.md)
    // Regexp result: create-folder.md
    const INCLUDE_FILE_PATH = /(?<=[(]).+(?=[)])/;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_CONTENTS.exec(content))) {
        // TODO: warn about non local urls
        const include = parseLocalUrl<IncludeInfo>(match[0].match(INCLUDE_FILE_PATH)?.[0]);

        if (include) {
            include.path = rebasePath(this.path, include.path as RelativePath);
            include.location = this.sourcemap.location(
                match.index,
                INCLUDE_CONTENTS.lastIndex,
                lines,
            );

            includes.push(include);
        }
    }

    this.markdown.setDependencies(this.path, includes);

    return content;
}

function resolveAssets(this: LoaderContext, content: string) {
    const assets = [];
    const lines = this.sourcemap.lines(content);

    // This is not significant which type of content (image or link) we will match.
    // Anyway we need to copy linked local media content.
    const ASSETS_CONTENTS = /]\(\s*[^\s)]+\s*\)/g;
    // Backward search is payful syntax. So we can't use it on large texts.
    const ASSET_LINK = /(?<=]\(\s*)[^\s)]+(?=\s*\))/;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = ASSETS_CONTENTS.exec(content))) {
        const asset = parseLocalUrl<AssetInfo>(match[0].match(ASSET_LINK)![0]);
        if (asset && isMediaLink(asset.path)) {
            asset.path = rebasePath(this.path, asset.path);
            asset.location = this.sourcemap.location(match.index, ASSETS_CONTENTS.lastIndex, lines);
            assets.push(asset);
        }
    }

    this.markdown.setAssets(this.path, assets);

    return content;
}

function resolveHeadings(this: LoaderContext, content: string) {
    const headings = [];
    const lines = this.sourcemap.lines(content);

    const commonRx = '((^|\\n)(?<common>(#{1,6}\\s*).*?))(?=\\n|$)';
    const alternateRx = '(?:^(\\r?\\n)*|(\\r?\\n){2,})(?<alternate>[\\s\\S]+?\\n(-+|=+))(?=\\n|$)';
    const rx = new RegExp(`${commonRx}|${alternateRx}`, 'g');

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = rx.exec(content))) {
        const {common, alternate} = match!.groups!;
        const heading = common || alternate;

        headings.push({
            content: heading,
            location: this.sourcemap.location(rx.lastIndex - heading.length, rx.lastIndex, lines),
        });
    }

    // const {title, headings} = transform(raw.join('\n\n'), {
    //     assetsPublicPath: './',
    //     extractTitle: true,
    //     needFlatListHeadings: true,
    //     supportGithubAnchors,
    //     log: this.logger,
    // }).result;

    this.markdown.setHeadings(this.path, headings);

    return content;
}

function applyPlugins(this: LoaderContext, content: string) {
    const transformer = getTransformer(this);

    return transformer(content);
}

function getTransformer(context: LoaderContext) {
    switch (context.mode) {
        case TransformMode.Html:
            return async (content: string) => {
                const {result} = transform(content, {
                    ...context.options,
                    isLiquided: true,
                    plugins: context.plugins,
                    root: context.root,
                    path: join(context.root, context.path),
                    lang: context.lang,
                    assetsPublicPath: './',
                    getPublicPath,
                    extractTitle: true,
                    log: context.logger,
                });

                const {title, headings} = result;

                context.markdown.setInfo(context.path, {title, headings});

                return result.html;
            };
        case TransformMode.Md:
            return async (content: string) => {
                context.markdown.setInfo(context.path, {title: '', headings: []});

                for (const plugin of context.plugins) {
                    const result = await plugin.call(context, content);
                    content = result === undefined ? content : result;
                }

                return content;
            };
    }
}
