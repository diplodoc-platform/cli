import {dirname, resolve} from 'path';
import {readFileSync, writeFileSync} from 'fs';
import {dump, load} from 'js-yaml';

import {ArgvService, PresetService} from './index';
import {LeadingPage, LeadingPageLinks} from '../models';
import {filterFiles} from './utils';

function filterFile(path: string) {
    const {
        input: inputFolderPath,
    } = ArgvService.getConfig();

    const pathToDir: string = dirname(path);
    const filePath = resolve(inputFolderPath, path);
    const content = readFileSync(filePath, 'utf8');
    const parsedIndex: LeadingPage = load(content) as LeadingPage;

    const {vars} = ArgvService.getConfig();
    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should remove all links with false expressions */
    parsedIndex.links = filterFiles(parsedIndex.links, 'links', combinedVars) as LeadingPageLinks[];

    writeFileSync(filePath, dump(parsedIndex));
}

export default {
    filterFile,
};
