import {TocService} from '..';
import {YfmToc} from '../../models';

export const getAssetsPublicPath = (filePath: string) => {
    const toc: YfmToc | null = TocService.getForPath(filePath) || null;

    const deepBase = toc?.root?.deepBase || toc?.deepBase || 0;
    const deepBasePath = deepBase > 0 ? Array(deepBase).fill('../').join('') : './';

    /* Relative path from folder of .md file to root of user' output folder */
    return deepBasePath;
};

export const getAssetsRootPath = (filePath: string) => {
    const toc: YfmToc | null = TocService.getForPath(filePath) || null;

    return toc?.root?.base || toc?.base;
};
