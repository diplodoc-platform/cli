import {writeFileSync} from 'fs';
import {extname, join, resolve} from 'path';

import {ArgvService, TocService} from "../services";
import {convertBackSlashToSlash} from "../utils";

export function preparingMapFile(): void {
    const resolvedNavPath = TocService.getNavigationPaths()
        .map((filePath) => {
            const map = convertBackSlashToSlash(filePath).replace(extname(filePath), '')
            if (map.endsWith('index')) {
                return map.replace('index', '');
            }
            return map
        });

    const {o: outputFolderPath} = ArgvService.getConfig();
    const outputPath = resolve(outputFolderPath);
    const filesMapBuffer = Buffer.from(JSON.stringify(resolvedNavPath, null, '\t'), 'utf8');
    const mapFile = join(outputPath, 'files.json');

    writeFileSync(mapFile, filesMapBuffer);
}
