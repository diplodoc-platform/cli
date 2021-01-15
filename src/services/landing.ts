import {dirname, resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

import {ArgvService, PresetService} from './index';
import {YfmLanding, YfmLandingLinks} from '../models';
import {filterFiles} from './utils';

function add(path: string) {
    const {
        input: inputFolderPath,
    } = ArgvService.getConfig();

    const pathToDir: string = dirname(path);
    const content = readFileSync(resolve(inputFolderPath, path), 'utf8');
    const parsedIndex: YfmLanding = safeLoad(content);

    const {vars} = ArgvService.getConfig();
    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should remove all links with false expressions */
    parsedIndex.links = filterFiles(parsedIndex.links, 'links', combinedVars) as YfmLandingLinks[];
}

export default {
    add,
};
