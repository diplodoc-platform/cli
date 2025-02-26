import type {SourceMap} from '~/core/utils/sourcemap';
import type {Meta} from '~/core/meta';
import type {Logger} from '~/core/logger';
import type {AdditionalInfo, CollectPlugin, HeadingInfo, IncludeInfo, TransformPlugin} from './types';

import {join} from 'node:path';
import {cloneDeepWith} from 'lodash';
import {load} from 'js-yaml';
import transform from '@diplodoc/transform';
import {getPublicPath} from '@diplodoc/transform/lib/utilsFS';
import {liquidSnippet} from '@diplodoc/transform/lib/liquid';

import {isMediaLink, isRelativePath} from '~/core/utils';

import {LineMap, escapeLiquid, lines, rebasePath, unescapeLiquid, zipmap} from './utils';

const SEP = '---';

export enum TransformMode {
    Html = 'html',
    Md = 'md',
}

type LoaderContextBase = {
    root: AbsolutePath;
    path: NormalizedPath;
    vars: Hash;
    lang: string;
    logger: Logger;
    markdown: {
        setDependencies(path: NormalizedPath, deps: IncludeInfo[]): void;
        setAssets(path: NormalizedPath, assets: NormalizedPath[]): void;
        setMeta(path: NormalizedPath, meta: Meta): void;
        setHeadings(path: NormalizedPath, headings: HeadingInfo[]): void;
        setInfo(path: NormalizedPath, info: AdditionalInfo): void;
    };
    sourcemap: SourceMap;
    options: {
        rootInput: AbsolutePath;
        allowHTML: boolean;
        needToSanitizeHtml: boolean;
        useLegacyConditions: boolean;
        supportGithubAnchors: boolean;

        applyPresets: boolean;
        resolveConditions: boolean;
        conditionsInCode: boolean;
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
    content = templateContent.call(this, content);
    content = resolveDependencies.call(this, content);
    content = resolveAssets.call(this, content);
    content = resolveHeadings.call(this, content);
    // content = await replaceTitleRefs.call(this, content);
    content = applyPlugins.call(this, content);

    return content;
}

function mangleFrontMatter(this: LoaderContext, rawContent: string) {
    const {path, vars, options} = this;
    const {applyPresets, resolveConditions} = options;

    const rawFrontmatter = matchMetadata(rawContent);
    if (!rawFrontmatter) {
        return rawContent;
    }

    const strippedFrontmatter = escapeLiquid(rawFrontmatter.slice(SEP.length, -SEP.length) || '{}');
    const frontmatter = cloneDeepWith(load(strippedFrontmatter), (value: unknown) =>
        typeof value === 'string'
            ? liquidSnippet(unescapeLiquid(value), vars, path, {
                  substitutions: applyPresets,
                  conditions: resolveConditions,
                  keepNotVar: true,
                  withSourceMap: false,
              })
            : undefined,
    );

    this.markdown.setMeta(path, frontmatter);

    // this.markdown.meta.add(path, await run.vcs.metadata(path, meta, deps));

    this.sourcemap.offset(-lines(rawFrontmatter));

    return rawContent.slice(rawFrontmatter.length);
}

function templateContent(this: LoaderContext, content: string) {
    const {path, vars, options} = this;
    const {applyPresets, resolveConditions, conditionsInCode, useLegacyConditions} = options;

    const result = liquidSnippet(content, vars, path, {
        conditions: resolveConditions,
        substitutions: applyPresets,
        conditionsInCode,
        withSourceMap: true,
        // TODO
        keepNotVar: true,
        useLegacyConditions,
    });

    this.sourcemap.update(zipmap(result.sourceMap));

    return result.output;
}

function resolveDependencies(this: LoaderContext, content: string) {
    const includes = [];
    const linemap = new LineMap(content);

    // Include example: {% include [createfolder](create-folder.md) %}
    // Regexp result: [createfolder](create-folder.md)
    const INCLUDE_CONTENTS = /{%\s*include\s.+?%}/g;
    // Include example: [createfolder](create-folder.md)
    // Regexp result: create-folder.md
    const INCLUDE_FILE_PATH = /(?<=[(]).+(?=[)])/;

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = INCLUDE_CONTENTS.exec(content))) {
        const include = match[0].match(INCLUDE_FILE_PATH)?.[0] as RelativePath;
        const location = linemap.location(
            INCLUDE_CONTENTS.lastIndex,
            INCLUDE_CONTENTS.lastIndex + match[0].length,
        );

        includes.push([rebasePath(this.path, include), location] as const);
    }

    this.markdown.setDependencies(this.path, includes);

    return content;
}

function resolveAssets(this: LoaderContext, content: string) {
    // This is not significant which type of content (image or link) we will match.
    // Anyway we need to copy linked local media content.
    const ASSETS_CONTENTS = /]\(\s*[^\s)]+.*?\)/g;
    // Backward search is payful syntax. So we can't use it on large texts.
    const ASSET_LINK = /(?<=]\(\s*)[^\s)]+(?=.*?\))/;

    const assets = [];

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = ASSETS_CONTENTS.exec(content))) {
        const asset = match[0].match(ASSET_LINK)![0];
        if (isRelativePath(asset) && isMediaLink(asset)) {
            assets.push(rebasePath(this.path, asset));
        }
    }

    this.markdown.setAssets(this.path, assets);

    return content;
}

function resolveHeadings(this: LoaderContext, content: string) {
    const headings = [];
    const linemap = new LineMap(content);

    const commonRx = '((^|\\n)(?<heading>(#{1,6}\\s*).*?))(?=\\n|$)';
    // @see https://www.markdownguide.org/basic-syntax/#alternate-syntax
    const alternateRx =
        '(?<=^(\\r?\\n)*|(\\r?\\n){2,})(?<heading>(((?!-+|=+).)+?\\n?)+?\\n(-+|=+))(?:\\n|$)';
    const rx = new RegExp(`${commonRx}|${alternateRx}`, 'g');

    let match;
    // eslint-disable-next-line no-cond-assign
    while ((match = rx.exec(content))) {
        const heading = match!.groups!.heading;
        headings.push([
            heading,
            linemap.location(rx.lastIndex, rx.lastIndex + heading.length),
        ] as const);
    }

    // const {title, headings} = transform(raw.join('\n\n'), {
    //     assetsPublicPath: './',
    //     extractTitle: true,
    //     needFlatListHeadings: true,
    //     supportGithubAnchors,
    //     log: this.logger,
    // }).result;

    // this.markdown.setTitle(this.path, title);
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
            return (content: string) => {
                const {result} = transform(content, {
                    ...context.options,
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
            return (content: string) => {
                context.markdown.setInfo(context.path, {title: '', headings: []});

                return context.plugins.reduce(
                    (content: string, plugin: CollectPlugin) => plugin.call(context, content),
                    content,
                );
            };
    }
}

function matchMetadata(content: string) {
    if (!content.startsWith(SEP)) {
        return null;
    }

    const closeStart = content.indexOf('\n' + SEP, SEP.length);
    if (closeStart === -1) {
        return null;
    }

    const closeEnd = closeStart + SEP.length;

    return content.slice(0, closeEnd);
}
