import {writeFileSync} from 'fs';
import {extname, join} from 'path';

import {ArgvService, TocService} from '../services';

type TocItem = {
    name: string;
    items?: TocItems;
    href?: string;
};

type TocItems = TocItem[];

export function prepareMapFile(): void {
    const {
        output: outputFolderPath,
    } = ArgvService.getConfig();

    const navigationPathsWithoutExtensions =
        TocService.getNavigationPaths().map((path) => {
            let preparedPath = path.replace(extname(path), '');

            if (preparedPath.endsWith('/index')) {
                preparedPath = preparedPath.substring(0, preparedPath.length - 5);
            }

            return preparedPath;
        });
    const navigationPaths = {files: [...new Set(navigationPathsWithoutExtensions)]};
    const filesMapBuffer = Buffer.from(JSON.stringify(navigationPaths, null, '\t'), 'utf8');
    const mapFile = join(outputFolderPath, 'files.json');

    writeFileSync(mapFile, filesMapBuffer);
}
