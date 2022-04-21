import {readFileSync, writeFileSync} from 'fs';
import {dirname, extname, join} from 'path';
import yaml from 'js-yaml';
import walkSync from 'walk-sync';

import {ArgvService} from '../services';

type TocItem = {
    name: string;
    items?: TocItems;
    href?: string;
};

type TocItems = TocItem[];

type Toc = {
    title: string;
    items: TocItems;
};

export function prepareMapFile(): void {
    const {
        output: outputFolderPath,
    } = ArgvService.getConfig();

    const navigationPaths = {
        files: collectFiles(outputFolderPath),
    };

    const filesMapBuffer = Buffer.from(JSON.stringify(navigationPaths, null, '\t'), 'utf8');
    const mapFile = join(outputFolderPath, 'files.json');

    writeFileSync(mapFile, filesMapBuffer);
}

function walkItems(items: TocItems, source: string) {
    return items.reduce((acc: string[], {href, items: subItems}) => {
        if (href) {
            acc.push(join(source, href).replace(extname(href), ''));
        }

        if (subItems) {
            acc.push(...walkItems(subItems, source));
        }

        return acc;
    }, []);
}

function collectFiles(cwd: string): string[] {
    const files = walkSync(cwd, {
        directories: false,
        globs: ['**/toc.yaml'],
    });

    return files
        .filter((path) => !path.includes('/_'))
        .reduce((acc: string[], path: string) => {
            const fullPath = join(cwd, path);
            const toc = yaml.load(readFileSync(fullPath, 'utf8')) as Toc;

            acc.push(`${dirname(path)}/`);

            return acc.concat(walkItems(toc.items, dirname(path)));
        }, []);
}
