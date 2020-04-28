import {relative, dirname, basename, extname, format, join} from 'path';
import {blue, green} from 'chalk';

export interface ResolverOptions {
    inputPath: string;
    filename: string;
    fileExtension: string;
    outputPath: string
    outputBundlePath: string;
}

export function transformToc(toc: any, pathToFileDirectory: string): any {
    if (!toc) {
        return null;
    }

    const localToc: any = JSON.parse(JSON.stringify(toc));
    const baseTocPath: string = localToc.base;
    const navigationItemQueue = [localToc];

    while (navigationItemQueue.length) {
        const navigationItem = navigationItemQueue.shift()!;
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
    proc: function(pathToFile: string) {
        console.log(`${blue('PROC')} Processing file ${pathToFile}`);
    },
    copy: function(pathToFile: string) {
        console.log(`${green('COPY')} Copying file ${pathToFile}`);
    }
};
