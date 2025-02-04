import type {Run} from '~/commands/build';

import {extname, join} from 'path';

type TocItem = {
    name: string;
    items?: TocItems;
    href?: string;
};

type TocItems = TocItem[];

export async function prepareMapFile(run: Run) {
    const navigationPathsWithoutExtensions = run.toc.entries.map((path) => {
        let preparedPath = path.replace(extname(path), '');

        if (preparedPath.endsWith('/index')) {
            preparedPath = preparedPath.substring(0, preparedPath.length - 5);
        }

        return preparedPath;
    });
    const navigationPaths = {files: [...new Set(navigationPathsWithoutExtensions)].sort()};
    const content = JSON.stringify(navigationPaths, null, '\t');

    await run.write(join(run.output, 'files.json'), content);
}
