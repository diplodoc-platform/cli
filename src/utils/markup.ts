import {platform} from 'process';
import {Platforms} from '../constants';
import {SinglePageResult} from '../models';
import {PluginService} from '../services';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateStaticMarkup(props: any, pathToBundle: string): string {
    const {title: metaTitle} = props.data.meta || {};
    const {title: tocTitle} = props.data.toc;
    const {title: pageTitle} = props.data;

    const title = getTitle({metaTitle, tocTitle, pageTitle});

    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                ${getMetadata(props.data.meta)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${PluginService.getHeadContent()}
            </head>
            <body class="yc-root yc-root_theme_light">
                <div id="root"></div>
                <script type="application/javascript">
                   window.__DATA__ = ${JSON.stringify(props)};
                </script>
                <script type="application/javascript" src="${pathToBundle}/app.js"></script>
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

    const metaEntries = Object.entries(metadata);

    return metaEntries
        .map(([name, content]) => {
            return `<meta name="${name}" content="${content}">`;
        })
        .join('\n');
}

export function joinSinglePageResults(singlePageResults: SinglePageResult[]): string {
    const delimeter = `${сarriage}${сarriage}<hr class="yfm-page__delimeter">${сarriage}${сarriage}`;
    return singlePageResults
        .filter(({content}) => content)
        .map(({content}) => content)
        .join(delimeter);
}

export function replaceDoubleToSingleQuotes(str: string): string {
    return str.replace(/"/g, '\'');
}

export const сarriage = platform === Platforms.WINDOWS ? '\r\n' : '\n';
