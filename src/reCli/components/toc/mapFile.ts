import path from 'node:path';
import {normalizePath} from '~/core/utils';

export function getMapFile(pages: string[]) {
    const navigationPathsWithoutExtensions = pages.map((pagePath) => {
        let preparedPath = normalizePath(
            path.dirname(pagePath) + '/' + path.basename(pagePath, path.extname(pagePath)),
        );

        if (preparedPath.endsWith('/index')) {
            preparedPath = preparedPath.substring(0, preparedPath.length - 5) as NormalizedPath;
        }

        return preparedPath;
    });

    return {files: navigationPathsWithoutExtensions.sort()};
}
