import {readFileSync} from 'fs';
import {relative, dirname, basename, extname, format, join, resolve} from 'path';
import yaml from 'js-yaml';
import yfmTransform from 'yfm-transform';

import {PresetService, ArgvService} from './services';

export interface FileTransformOptions {
    path: string;
    root?: string;
}

export const FileTransformer: Record<string, Function> = {
    '.yaml': function({path}: FileTransformOptions): Object {
        const {input} = ArgvService.getConfig();
        const content: string = readFileSync(resolve(input, path), 'utf8');
        return {
            data: yaml.safeLoad(content)
        };
    },
    '.md': function({path}: FileTransformOptions): any {
        const {plugins, options, input, output, vars} = ArgvService.getConfig();
        const resolvedPath: string = resolve(input, path);
        const content: string = readFileSync(resolvedPath, 'utf8');

        return yfmTransform(content, {
            ...options,
            assetsPublicPath: relative(path, output),
            vars: {
                ...PresetService.get(dirname(path)),
                ...vars,
            },
            root: resolve(input),
            path: resolvedPath,
            plugins,
        });
    }
};

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
