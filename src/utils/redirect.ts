import {BUNDLE_FOLDER, Lang, RTL_LANGS} from '../constants';
import {PluginService} from '../services';

import {join} from 'path';
import manifest from '@diplodoc/client/manifest';

export function generateStaticRedirect(lang: Lang, link: string): string {
    const isRTL = RTL_LANGS.includes(lang);

    return `
        <!DOCTYPE html>
        <html lang="${lang}" dir="${isRTL ? 'rtl' : 'ltr'}">
            <head>
                <meta charset="utf-8">
                <meta http-equiv="refresh" content="0; url=${link}">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Redirect</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
                ${manifest.css
                    .filter((file: string) => isRTL === file.includes('.rtl.css'))
                    .map((url: string) => join(BUNDLE_FOLDER, url))
                    .map((src: string) => `<link type="text/css" rel="stylesheet" href="${src}" />`)
                    .join('\n')}
                ${PluginService.getHeadContent()}
                <script type="text/javascript">
                    window.location.replace("${link}");
                </script>
            </head>
            <body class="g-root g-root_theme_light">
                If you are not redirected automatically, follow this <a href="${link}">link to example</a>.
            </body>
        </html>
    `;
}
