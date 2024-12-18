import type {Run} from '~/commands/build';

import {writeFileSync} from 'fs';
import {extname, join} from 'path';

type TocItem = {
    name: string;
    items?: TocItems;
    href?: string;
};

type TocItems = TocItem[];

export function prepareMapFile(run: Run): void {
    const navigationPathsWithoutExtensions = run.toc.entries.map((path) => {
        let preparedPath = path.replace(extname(path), '');

        if (preparedPath.endsWith('/index')) {
            preparedPath = preparedPath.substring(0, preparedPath.length - 5);
        }

        return preparedPath;
    });
    const navigationPaths = {files: [...new Set(navigationPathsWithoutExtensions)].sort()};
    const filesMapBuffer = Buffer.from(JSON.stringify(navigationPaths, null, '\t'), 'utf8');
    const mapFile = join(run.output, 'files.json');

    writeFileSync(mapFile, filesMapBuffer);
}
