import {join} from 'path';

import {BUNDLE_FOLDER, CARRIAGE_RETURN, CUSTOM_STYLE, RTL_LANGS} from '../constants';
import {LeadingPage, Resources, TextItems, VarsMetadata} from '../models';
import {ArgvService, PluginService} from '../services';

import {DocInnerProps, DocPageData, render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {escape} from 'html-escaper';

export interface TitleMeta {
    title?: string;
}

export type Meta = TitleMeta &
    Resources & {
        metadata: VarsMetadata;
    };

export function generateStaticMarkup(
    props: DocInnerProps<DocPageData>,
    deepBase: number,
    deep = 0,
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
    const isRTL = RTL_LANGS.includes(props.lang);
    const deepBasePath = deepBase > 0 ? Array(deepBase).fill('../').join('') : './';
    const deepPath = deep > 0 ? Array(deep).fill('../').join('') : './';

    return `
        <!DOCTYPE html>
        <html lang="${props.lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <meta charset="utf-8">
                <base href="${deepPath}" />
                ${getMetadata(metadata, restYamlConfigMeta)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${manifest.app.css
                    .filter((file: string) => isRTL === file.includes('.rtl.css'))
                    .map((url: string) => join(deepBasePath, BUNDLE_FOLDER, url))
                    .map((src: string) => `<link type="text/css" rel="stylesheet" href="${src}" />`)
                    .join('\n')}
                ${PluginService.getHeadContent()}
                ${resources}
            </head>
            <body class="g-root g-root_theme_light">
                <div id="root">${html}</div>
                <script type="application/javascript">
                   window.STATIC_CONTENT = ${staticContent}
                   window.__DATA__ = ${JSON.stringify(props)};
                </script>
                ${manifest.app.js
                    .map((url: string) => join(deepBasePath, BUNDLE_FOLDER, url))
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
            result += `<meta ${args} />` + CARRIAGE_RETURN;
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
