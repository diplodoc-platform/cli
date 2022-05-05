import {dirname, resolve} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import {dump, load} from 'js-yaml';
import log from '@doc-tools/transform/lib/log';

import {ArgvService, PresetService} from './index';
import {LeadingPage} from '../models';
import {filterTextItems, filterFiles, firstFilterTextItems} from './utils';

function filterFile(path: string) {
    const {
        input: inputFolderPath,
    } = ArgvService.getConfig();

    const pathToDir = dirname(path);
    const filePath = resolve(inputFolderPath, path);
    const content = readFileSync(filePath, 'utf8');
    const parsedIndex = load(content) as LeadingPage;

    const {vars} = ArgvService.getConfig();
    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should remove all links with false expressions */
    try {
        parsedIndex.title = firstFilterTextItems(
            parsedIndex.title,
            combinedVars,
            {resolveConditions: true},
        );

        parsedIndex.description = filterTextItems(
            parsedIndex.description,
            combinedVars,
            {resolveConditions: true},
        );

        if (parsedIndex.meta?.title) {
            parsedIndex.meta.title = firstFilterTextItems(
                parsedIndex.meta.title,
                combinedVars,
                {resolveConditions: true},
            );
        }

        if (parsedIndex.nav) {
            parsedIndex.nav.title = firstFilterTextItems(
                parsedIndex.nav.title,
                combinedVars,
                {resolveConditions: true},
            );
        }

        parsedIndex.links = filterFiles(parsedIndex.links, 'links', combinedVars, {resolveConditions: true});
        writeFileSync(filePath, dump(parsedIndex));
    } catch (error) {
        log.error(`Error while filtering index file: ${path}. Error message: ${error}`);
    }
}

export default {
    filterFile,
};
