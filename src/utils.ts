import {readFileSync} from 'fs';
import {relative, dirname, basename, extname, format, join, resolve} from 'path';
import yaml from 'js-yaml';
import yfmTransformMd2HTML from 'yfm-transform';
// @ts-ignore
import yfmTransformMd2Md from 'yfm-transform/lib/transformToMD';

import {PresetService, ArgvService, TocService} from './services';

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
        const {plugins, options, input, vars} = ArgvService.getConfig();
        const resolvedPath: string = resolve(input, path);
        const content: string = readFileSync(resolvedPath, 'utf8');

        /* Relative path from folder of .md file to root of user' output folder */
        const assetsPublicPath = relative(dirname(resolvedPath), resolve(input));

        return yfmTransformMd2HTML(content, {
            ...options,
            vars: {
                ...PresetService.get(dirname(path)),
                ...vars,
            },
            root: resolve(input),
            path: resolvedPath,
            assetsPublicPath,
            plugins,
        });
    }
};

export interface ResolverOptions {
    inputPath: string;
    filename: string;
    fileExtension: string;
    outputPath: string
    outputBundlePath: string;
}

/**
 * Transforms markdown file to HTML format.
 * @param inputPath
 * @param fileExtension
 * @param outputPath
 * @param outputBundlePath
 */
export function resolveMd2HTML({inputPath, fileExtension, outputPath, outputBundlePath}: ResolverOptions): string {
    const pathToDir: string = dirname(inputPath);
    const toc: any = TocService.getForPath(inputPath);
    const tocBase: string = toc ? toc.base : '';
    const pathToIndex: string = pathToDir !== tocBase ? pathToDir.replace(tocBase, '..') : '';

    const transformFn: Function = FileTransformer[fileExtension];
    const data: any = transformFn({path: inputPath});
    const props: any = {
        isLeading: inputPath.endsWith('index.yaml'),
        toc: transformToc(toc, pathToDir) || {},
        pathname: join(pathToIndex, basename(outputPath)),
        ...data,
    };
    const outputDir = dirname(outputPath);
    const relativePathToBundle: string = relative(resolve(outputDir), resolve(outputBundlePath));

    return generateStaticMarkup(props, relativePathToBundle);
}

/**
 * Transforms raw markdown file to public markdown document.
 * @param inputPath
 * @param outputPath
 */
export function resolveMd2Md(inputPath: string, outputPath: string): string {
    const {input, vars} = ArgvService.getConfig();
    const resolvedInputPath = resolve(input, inputPath);
    const content: string = readFileSync(resolvedInputPath, 'utf8');

    return yfmTransformMd2Md(content, {
        path: resolvedInputPath,
        destPath: join(outputPath, basename(inputPath)),
        vars: {
            ...PresetService.get(dirname(inputPath)),
            ...vars,
        }
    });
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
