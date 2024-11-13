import {join} from 'path';

import {
    BUNDLE_FOLDER,
    CARRIAGE_RETURN,
    CUSTOM_STYLE,
    DEFAULT_CSP_SETTINGS,
    RTL_LANGS,
} from '../constants';
import {LeadingPage, Resources, TextItems, VarsMetadata, YfmToc} from '../models';
import {ArgvService, PluginService} from '../services';
import {getDepthPath} from '../utils';

import {DocInnerProps, DocPageData, render} from '@diplodoc/client/ssr';
import manifest from '@diplodoc/client/manifest';

import {escape} from 'html-escaper';
import {getCSP} from 'csp-header';

export interface TitleMeta {
    title?: string;
}

export type Meta = TitleMeta &
    Resources & {
        metadata: VarsMetadata;
    };

type TocInfo = {
    content: YfmToc;
    path: string;
};

export function generateStaticMarkup(
    props: DocInnerProps<DocPageData>,
    toc: TocInfo,
    title: string,
): string {
    /* @todo replace rest operator with proper unpacking */
    const {style, script, csp, metadata, ...restYamlConfigMeta} = (props.data.meta as Meta) || {};
    const resources = getResources({style, script});

    const {staticContent} = ArgvService.getConfig();
    if (staticContent) {
        // TODO: there shoul be two different types YfmToc and YfmProcessedToc
        // @ts-ignore
        props.data.toc = toc.content;
    }

    const depth = props.router.depth;
    const html = staticContent ? render(props) : '';
    const isRTL = RTL_LANGS.includes(props.lang);
    const base = getDepthPath(depth - 1);

    return `
        <!DOCTYPE html>
        <html lang="${props.lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <meta charset="utf-8">
                <base href="${base}" />
                ${getMetadata(metadata, restYamlConfigMeta)}
                ${generateCSP(csp)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${manifest.app.css
                    .filter((file: string) => isRTL === file.includes('.rtl.css'))
                    .map((url: string) => join(BUNDLE_FOLDER, url))
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
                <script src="${toc.path + '.js'}" type="application/javascript"></script>
                ${manifest.app.js
                    .map((url: string) => join(BUNDLE_FOLDER, url))
                    .map(
                        (src: string) =>
                            `<script type="application/javascript" src="${src}"></script>`,
                    )
                    .join('\n')}
            </body>
        </html>
    `;
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

function generateCSP(csp?: Record<string, string[]>[]) {
    if (!csp) {
        return '';
    }

    const collected = [DEFAULT_CSP_SETTINGS].concat(csp).reduce((acc, curr) => {
        if (!curr || typeof curr !== 'object') {
            return acc;
        }

        const entries = Object.entries(curr);

        for (const [cspRule, value] of entries) {
            acc[cspRule] ??= [];

            const flat = Array.isArray(value) ? value : [value];

            flat.forEach((cspValue) => {
                if (!acc[cspRule].includes(cspValue)) {
                    acc[cspRule].push(cspValue);
                }
            });
        }

        return acc;
    }, {});

    const stringified = getCSP({directives: collected});

    return `<meta http-equiv="Content-Security-Policy" content="${stringified}">`;
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
