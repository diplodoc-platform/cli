import {join} from 'path';
import {platform} from 'process';

import {CUSTOM_STYLE, Platforms} from '../constants';
import {LeadingPage, Resources, SinglePageResult, TextItems, VarsMetadata} from '../models';
import {ArgvService, PluginService} from '../services';
import {preprocessPageHtmlForSinglePage} from './singlePage';

import {DocInnerProps, DocPageData, render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {escape} from 'html-escaper';

const dst = (bundlePath: string) => (target: string) => join(bundlePath, target);
export const сarriage = platform === Platforms.WINDOWS ? '\r\n' : '\n';

export interface TitleMeta {
    title?: string;
}

export type Meta = TitleMeta &
    Resources & {
        metadata: VarsMetadata;
    };

export function generateStaticMarkup(
    props: DocInnerProps<DocPageData>,
    pathToBundle: string,
): string {
    const {style, script, metadata, ...restYamlConfigMeta} = (props.data.meta as Meta) || {};
    const {title: tocTitle} = props.data.toc;
    const {title: pageTitle} = props.data;

    const title = getTitle({
        metaTitle: props.data.meta.title,
        tocTitle: tocTitle as string,
        pageTitle,
    });

    const resources = getResources({style, script});

    const {staticContent} = ArgvService.getConfig();

    const html = staticContent ? render(props) : '';

    return `
        <!DOCTYPE html>
        <html lang="${props.lang}">
            <head>
                <meta charset="utf-8">
                ${getMetadata(metadata, restYamlConfigMeta)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${manifest.css
                    .map(dst(pathToBundle))
                    .map((src: string) => `<link type="text/css" rel="stylesheet" href="${src}" />`)
                    .join('\n')}
                ${PluginService.getHeadContent()}
                ${resources}
            </head>
            <body class="yc-root yc-root_theme_light">
                <div id="root">${html}</div>
                <script type="application/javascript">
                   window.STATIC_CONTENT = ${staticContent}
                   window.__DATA__ = ${JSON.stringify(props)};
                </script>
                ${manifest.js
                    .map(dst(pathToBundle))
                    .map(
                        (src: string) =>
                            `<script type="application/javascript" src="${src}"></script>`,
                    )
                    .join('\n')}
            </body>
        </html>
    `;
}

interface GetTitleOptions {
    tocTitle?: string;
    metaTitle?: string;
    pageTitle?: string;
}

function getTitle({tocTitle, metaTitle, pageTitle}: GetTitleOptions) {
    const resultPageTitle = metaTitle || pageTitle;

    if (!resultPageTitle && tocTitle) {
        return tocTitle;
    }

    if (resultPageTitle && !tocTitle) {
        return resultPageTitle;
    }

    return resultPageTitle && tocTitle ? `${resultPageTitle} | ${tocTitle}` : '';
}

function getMetadata(metadata: VarsMetadata | undefined, restMeta: LeadingPage['meta']): string {
    let result = '';

    const addMetaTagsFromObject = (value: Record<string, string | boolean | TextItems>) => {
        const args = Object.entries(value).reduce((acc, [name, content]) => {
            return acc + `${escape(name)}="${escape(content.toString())}" `;
        }, '');

        if (args.length) {
            result += `<meta ${args} />` + сarriage;
        }
    };

    if (metadata) {
        metadata.forEach(addMetaTagsFromObject);
    }

    if (restMeta) {
        Object.entries(restMeta)
            .map(([name, value]) => {
                return {name, content: value};
            })
            .forEach(addMetaTagsFromObject);
    }

    return result;
}

function getResources({style, script}: Resources) {
    const resourcesTags: string[] = [];

    if (style) {
        style.forEach((el, id) =>
            resourcesTags.push(
                `<link rel="stylesheet" type="text/css" href="${el}" ${
                    id === 0 && `id="${CUSTOM_STYLE}"`
                }>`,
            ),
        );
    }

    if (script) {
        script.forEach((el) => resourcesTags.push(`<script src="${el}"></script>`));
    }

    return resourcesTags.join('\n');
}

export function joinSinglePageResults(
    singlePageResults: SinglePageResult[],
    root: string,
    tocDir: string,
): string {
    const delimeter = `<hr class="yfm-page__delimeter">`;
    return singlePageResults
        .filter(({content}) => content)
        .map(({content, path, title}) =>
            preprocessPageHtmlForSinglePage(content, {root, path, tocDir, title}),
        )
        .join(delimeter);
}

export function replaceDoubleToSingleQuotes(str: string): string {
    return str.replace(/"/g, "'");
}
