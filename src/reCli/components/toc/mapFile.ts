import {convertBackSlashToSlash} from '~/utils';
import path from 'node:path';

export function getMapFile(pages: string[]) {
    const navigationPathsWithoutExtensions = pages.map((pagePath) => {
        let preparedPath = convertBackSlashToSlash(
            path.dirname(pagePath) + '/' + path.basename(pagePath, path.extname(pagePath)),
        );

        if (preparedPath.endsWith('/index')) {
            preparedPath = preparedPath.substring(0, preparedPath.length - 5);
        }

        return preparedPath;
    });

    return {files: navigationPathsWithoutExtensions.sort()};
}
