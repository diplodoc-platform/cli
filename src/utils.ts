import {relative, dirname, basename, extname, format, join} from 'path';
import {blue, green} from 'chalk';

import {YfmToc} from './models';

export interface ResolverOptions {
    inputPath: string;
    filename: string;
    fileExtension: string;
    outputPath: string;
    outputBundlePath: string;
}

export function transformToc(toc: YfmToc|null, pathToFileDirectory: string): YfmToc|null {
    if (!toc) {
        return null;
    }

    const localToc: YfmToc = JSON.parse(JSON.stringify(toc));
    const baseTocPath: string = localToc.base || '';
    const navigationItemQueue = [localToc];

    while (navigationItemQueue.length) {
        const navigationItem = navigationItemQueue.shift();

        if (!navigationItem) {
            continue;
        }

        const {items, href} = navigationItem;

        if (items) {
            navigationItemQueue.push(...navigationItem.items);
        }

        if (href) {
            /* Path to directory with toc.yaml */
            const pathToIndexDirectory: string = relative(pathToFileDirectory, baseTocPath);

            const fileExtension: string = extname(href);
            const filename: string = basename(href, fileExtension);
            const transformedFilename: string = format({
                name: filename,
                ext: '.html',
            });

            navigationItem.href = join(pathToIndexDirectory, dirname(href), transformedFilename);
        }
    }

    return localToc;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateStaticMarkup(props: any, pathToBundle: string) {
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <title>${props.toc.title}</title>
                <style type="text/css">
                    body {
                        height: 100vh;
                    }
                </style>
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

export const logger = {
    proc: function (pathToFile: string) {
        console.log(`${blue('PROC')} Processing file ${pathToFile}`);
    },
    copy: function (pathToFile: string) {
        console.log(`${green('COPY')} Copying file ${pathToFile}`);
    },
};
