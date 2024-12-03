import walkSync from 'walk-sync';
import log from '@diplodoc/transform/lib/log';

import {ArgvService, TocService} from '../services';

const getFilePathsByGlobals = (globs: string[]): string[] => {
    const {input, ignore = []} = ArgvService.getConfig();

    return walkSync(input, {
        directories: false,
        includeBasePath: false,
        globs,
        ignore,
    });
};

export async function preparingTocFiles(): Promise<void> {
    try {
        const tocFilePaths = getFilePathsByGlobals(['**/toc.yaml']);
        await TocService.init(tocFilePaths);
    } catch (error) {
        log.error(`Preparing toc.yaml files failed. Error: ${error}`);
        throw error;
    }
}
