import {relative, dirname, basename, extname, format, join} from 'path';
import {blue, green} from 'chalk';

import {YfmToc, SinglePageResult} from './models';
import {YFM_PLUGINS} from './constants';
import {ArgvService} from './services';

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

        if (href && !isExternalHref(href)) {
            /* Path to directory with toc.yaml */
            const pathToIndexDirectory: string = relative(pathToFileDirectory, baseTocPath);

            const fileExtension: string = extname(href);
            const filename: string = basename(href, fileExtension);
            const transformedFilename: string = format({
                name: filename,
                ext: toc.singlePage ? '' : '.html',
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
                ${getMetadata(props.data.meta)}
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${props.data.toc.title}</title>
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

function getMetadata(metadata: { [key: string]: string }): string {
    const metaNames = Object.getOwnPropertyNames(metadata);
    let meta = '';

    metaNames.forEach((name: string) => {
        meta += `\n<meta name="${name}" content="${metadata[name]}">`;
    });

    return meta;
}

function writeLog(msg: string) {
    const {quiet} = ArgvService.getConfig();

    if (quiet) {
        return;
    }

    console.log(msg);
}

export const logger = {
    proc: function (pathToFile: string) {
        writeLog(`${blue('PROC')} Processing file ${pathToFile}`);
    },
    copy: function (pathToFile: string) {
        writeLog(`${green('COPY')} Copying file ${pathToFile}`);
    },
    upload: function (pathToFile: string) {
        writeLog(`${green('UPLOAD')} Uploading file ${pathToFile}`);
    },
};

// https://github.com/webpack/webpack/issues/4175#issuecomment-323023911
export function requireDynamically(path: string) {
    return eval(`require('${path}');`); // Ensure Webpack does not analyze the require statement
}

export function getCustomPlugins() {
    try {
        return requireDynamically('./plugins');
    } catch (e) {
        return [];
    }
}

export function getPlugins() {
    const customPlugins = getCustomPlugins();

    return [...YFM_PLUGINS, ...customPlugins];
}

export function isExternalHref(href: string) {
    return href.startsWith('http') || href.startsWith('//');
}

export const joinSinglePageResults = (singlePageResults: SinglePageResult[]) => {
    const delimeter = '\n\n<hr class="yfm-page__delimeter">\n\n';
    return singlePageResults.map((page) => {
        return page.content;
    }).join(delimeter);
};
