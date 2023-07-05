import {platform} from 'process';

import {CUSTOM_STYLE, Platforms, ResourceType} from '../constants';
import {SinglePageResult, Resources} from '../models';
import {ArgvService, PluginService} from '../services';
import {preprocessPageHtmlForSinglePage} from './singlePage';
import {render, DocInnerProps, DocPageData} from '@diplodoc/client';
import client from '../../scripts/client';

export interface TitleMeta {
    title?: string;
}
export type Meta = TitleMeta & Resources;

export function generateStaticMarkup(props: DocInnerProps<DocPageData>, pathToBundle: string): string {
    const {title: metaTitle, style, script} = props.data.meta as Meta || {};
    const {title: tocTitle} = props.data.toc;
    const {title: pageTitle} = props.data;

    const title = getTitle({
        metaTitle,
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
                ${getMetadata(props.data.meta as Record<string, string>)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                <link type="text/css" rel="stylesheet" href="${client.bundle.css(pathToBundle)}" />
                ${PluginService.getHeadContent()}
                ${resources}
            </head>
            <body class="yc-root yc-root_theme_light">
                <div id="root">${html}</div>
                <script type="application/javascript">
                   window.STATIC_CONTENT = ${staticContent}
                   window.__DATA__ = ${JSON.stringify(props)};
                </script>
                <script type="application/javascript" src="${client.bundle.js(pathToBundle)}"></script>
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

function getMetadata(metadata: Record<string, string>): string {
    if (!metadata) {
        return '';
    }

    // Exclude resources from meta, proceed them separately
    const metaEntries = Object.entries(metadata).filter(([key]) => !Object.keys(ResourceType).includes(key));

    return metaEntries
        .map(([name, content]) => {
            return `<meta name="${name}" content="${content}">`;
        })
        .join('\n');
}

function getResources({style, script}: Resources) {
    const resourcesTags: string[] = [];

    if (style) {
        style.forEach((el, id) => resourcesTags.push(
            `<link rel="stylesheet" type="text/css" href="${el}" ${id === 0 && `id="${CUSTOM_STYLE}"`}>`,
        ));
    }

    if (script) {
        script.forEach((el) => resourcesTags.push(
            `<script src="${el}"></script>`,
        ));
    }

    return resourcesTags.join('\n');
}

export const сarriage = platform === Platforms.WINDOWS ? '\r\n' : '\n';

export function joinSinglePageResults(singlePageResults: SinglePageResult[], root: string, tocDir: string): string {
    const delimeter = `${сarriage}${сarriage}<hr class="yfm-page__delimeter">${сarriage}${сarriage}`;
    return singlePageResults
        .filter(({content}) => content)
        .map(({content, path, title}) => preprocessPageHtmlForSinglePage(content, {root, path, tocDir, title}))
        .join(delimeter);
}

export function replaceDoubleToSingleQuotes(str: string): string {
    return str.replace(/"/g, '\'');
}
