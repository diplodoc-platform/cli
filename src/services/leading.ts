import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeDump, safeLoad} from 'js-yaml';

import {ArgvService, PresetService} from './index';
import {LeadingPage, LeadingPageLinks} from '../models';
import {filterFiles} from './utils';

function getContentFilteredFile(path: string) {
    const {
        input: inputFolderPath,
    } = ArgvService.getConfig();

    const pathToDir: string = dirname(path);
    const content = readFileSync(resolve(inputFolderPath, path), 'utf8');
    const parsedIndex: LeadingPage = safeLoad(content);

    const {vars} = ArgvService.getConfig();
    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should remove all links with false expressions */
    parsedIndex.links = filterFiles(parsedIndex.links, 'links', combinedVars) as LeadingPageLinks[];

    return safeDump(parsedIndex);
}

export default {
    getContentFilteredFile,
};
