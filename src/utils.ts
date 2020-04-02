import {readFileSync} from 'fs';
import {relative, dirname, basename, extname, format, join} from 'path';
import yaml from 'js-yaml';
import yfmTransform from 'yfm-transform';

import {PresetService, ArgvService} from './services';

export interface FileTransformOptions {
    path: string;
    root: string;
}

export const FileTransformer: Record<string, Function> = {
    '.yaml': function({path}: FileTransformOptions): Object {
        const content: string = readFileSync(path, 'utf8');
        return {
            data: yaml.safeLoad(content)
        };
    },
    '.md': function({path, root}: FileTransformOptions): any {
        const content: string = readFileSync(path, 'utf8');
        const {config: {plugins, options}, output} = ArgvService.argv;

        return yfmTransform(content, {
            ...options,
            assetsPublicPath: relative(dirname(path), output),
            vars: PresetService.getAll(),
            plugins,
            path,
            root,
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
