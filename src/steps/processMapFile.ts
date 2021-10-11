import {writeFileSync} from 'fs';
import {extname, join} from 'path';

import {ArgvService, TocService} from '../services';
import {convertBackSlashToSlash} from '../utils';

export function prepareMapFile(): void {
    const resolvedNavPath = TocService.getNavigationPaths()
        .map((filePath) => {
            const map = convertBackSlashToSlash(filePath).replace(extname(filePath), '');
            if (map.endsWith('/index')) {
                return map.replace('/index', '/');
            }
            return map;
        });

    const {output: outputFolderPath} = ArgvService.getConfig();
    const filesMapBuffer = Buffer.from(JSON.stringify(resolvedNavPath, null, '\t'), 'utf8');
    const mapFile = join(outputFolderPath, 'files.json');

    writeFileSync(mapFile, filesMapBuffer);
}
