import type {LiquidContext, SourceMap} from '@diplodoc/liquid';
import type {Meta} from '~/core/meta';
import type {Logger} from '~/core/logger';
import type {
    AdditionalInfo,
    AssetInfo,
    CollectPlugin,
    HeadingInfo,
    IncludeInfo,
    Location,
    TransformPlugin,
} from './types';

import {join} from 'node:path';
import {merge} from 'lodash';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {extractFrontMatter, liquidJson, liquidSnippet} from '@diplodoc/liquid';

import {isMediaLink, parseLocalUrl, rebasePath} from '~/core/utils';

import {findDefs, findLinks} from './utils';

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
    readFile(path: NormalizedPath): Promise<string>;
    markdown: {
        setComments(path: NormalizedPath, info: [number, number][]): void;
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
              mode: `${TransformMode.Md}`;
              plugins: CollectPlugin[];
          }
        | {
              mode: `${TransformMode.Html}`;
              plugins: TransformPlugin[];
          }
    );

export async function loader(this: LoaderContext, content: string) {
    content = mangleFrontMatter.call(this, content);
    content = templateContent.call(this, content);
    content = findComments.call(this, content);
    if (this.mode === TransformMode.Md) {
        content = await applyPlugins.call(this, content);
    }
    content = resolveDependencies.call(this, content);
    content = resolveAssets.call(this, content);
    content = resolveHeadings.call(this, content);
    if (this.mode === TransformMode.Html) {
        content = await applyPlugins.call(this, content);
    }

    return content;
}

function safeExtractFrontmatter(this: LoaderContext, content: string) {
    return extractFrontMatter(content, {json: true});
}

function mangleFrontMatter(this: LoaderContext, rawContent: string) {
    const {path, vars, options} = this;
    const {disableLiquid} = options;

    const [frontmatter, content, rawFrontmatter] = safeExtractFrontmatter.call(this, rawContent);

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

function findComments(this: LoaderContext, content: string) {
    const COMMENTS_CONTENTS = /<!-{2,}[\s\S]*?-{2,}>/g;
    const comments = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = COMMENTS_CONTENTS.exec(content))) {
        comments.push([match.index, COMMENTS_CONTENTS.lastIndex] as [number, number]);
    }

    this.markdown.setComments(this.path, comments);

    return content;
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

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const INCLUDE_CONTENTS = /{%\s*include\s*.+?%}/g;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_CONTENTS.exec(content))) {
        const link = findLinks(match[0])[0];
        // TODO: warn about non local urls
        const include = parseLocalUrl<IncludeInfo>(link as string);

        if (include) {
            include.path = rebasePath(this.path, include.path as RelativePath);
            include.location = [match.index, INCLUDE_CONTENTS.lastIndex];

            includes.push(include);
        }
    }

    this.markdown.setDependencies(this.path, includes);

    return content;
}

function resolveAssets(this: LoaderContext, content: string) {
    const assets = [];

    const defs = findDefs(content, true);
    const links = findLinks(content, true);

    for (const [link, location] of [...defs, ...links]) {
        const asset = parseLocalUrl<AssetInfo>(link);
        if (asset && isMediaLink(asset.path)) {
            asset.path = rebasePath(this.path, decodeURIComponent(asset.path) as RelativePath);
            asset.location = location;
            assets.push(asset);
        }
    }

    this.markdown.setAssets(this.path, assets);

    return content;
}

function resolveHeadings(this: LoaderContext, content: string) {
    const headings = [];

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
            location: [rx.lastIndex - heading.length, rx.lastIndex] as Location,
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

                const {title, headings, meta = {}} = result;

                context.markdown.setInfo(context.path, {title, headings, meta: meta as Meta});

                return result.html;
            };
        case TransformMode.Md:
            return async (content: string) => {
                let meta = {};

                for (const plugin of context.plugins) {
                    let result = await plugin.call(context, content, {});

                    if (Array.isArray(result)) {
                        meta = merge(meta, result[1] || {});
                        result = result[0] as string;
                    }

                    if (result !== undefined) {
                        content = result as string;
                    }
                }

                context.markdown.setInfo(context.path, {title: '', headings: [], meta});

                return content;
            };
    }

    throw new TypeError('Unknown loader mode ' + context.mode);
}
