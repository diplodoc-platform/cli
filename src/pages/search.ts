import {join} from 'path';

import {BUNDLE_FOLDER, Lang, RTL_LANGS} from '../constants';

import manifest from '@diplodoc/client/manifest';
import {SEARCH_PAGE_DEPTH} from '../services/search';

export function generateStaticSearch(lang: Lang): string {
    const isRTL = RTL_LANGS.includes(lang);

    return `
        <!DOCTYPE html>
        <html lang="${lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <meta name="robots" content="noindex"/>
                <title>Search</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${manifest.search.css
                    .filter((file: string) => isRTL === file.includes('.rtl.css'))
                    .map((url: string) => join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url))
                    .map((src: string) => `<link type="text/css" rel="stylesheet" href="${src}" />`)
                    .join('\n')}
            </head>
            <body class="g-root g-root_theme_light">
                <div id="root"></div>
                ${manifest.search.js
                    .map((url: string) => join('../'.repeat(SEARCH_PAGE_DEPTH), BUNDLE_FOLDER, url))
                    .map(
                        (src: string) =>
                            `<script type="application/javascript" src="${src}"></script>`,
                    )
                    .join('\n')}
            </body>
        </html>
    `;
}
