import {dirname, resolve} from 'path';
import {readFile, writeFile} from 'fs/promises';
import {dump, load} from 'js-yaml';
import log from '@diplodoc/transform/lib/log';

import {ArgvService, PresetService} from './index';
import {LeadingPage} from '../models';
import {
    filterFiles,
    filterTextItems,
    firstFilterTextItems,
    liquidField,
    liquidFields,
} from './utils';

async function filterFile(path: string) {
    const {input: inputFolderPath, vars} = ArgvService.getConfig();

    const pathToDir = dirname(path);
    const filePath = resolve(inputFolderPath, path);
    const content = await readFile(filePath, 'utf8');
    const parsedIndex = load(content) as LeadingPage;

    const combinedVars = {
        ...PresetService.get(pathToDir),
        ...vars,
    };

    /* Should remove all links with false expressions */
    try {
        const title = firstFilterTextItems(parsedIndex.title, combinedVars, {
            resolveConditions: true,
        });
        parsedIndex.title = liquidField(title, combinedVars, path);

        const description = filterTextItems(parsedIndex.description, combinedVars, {
            resolveConditions: true,
        });
        parsedIndex.description = liquidFields(description, combinedVars, path);

        if (parsedIndex.meta?.title) {
            const metaTitle = firstFilterTextItems(parsedIndex.meta.title, combinedVars, {
                resolveConditions: true,
            });
            parsedIndex.meta.title = liquidField(metaTitle, combinedVars, path);
        }

        if (parsedIndex.meta?.description) {
            const metaDescription = firstFilterTextItems(
                parsedIndex.meta.description,
                combinedVars,
                {resolveConditions: true},
            );
            parsedIndex.meta.description = liquidField(metaDescription, combinedVars, path);
        }

        if (parsedIndex.nav) {
            const navTitle = firstFilterTextItems(parsedIndex.nav.title, combinedVars, {
                resolveConditions: true,
            });
            parsedIndex.nav.title = liquidField(navTitle, combinedVars, path);
        }

        parsedIndex.links = filterFiles(parsedIndex.links, 'links', combinedVars, {
            resolveConditions: true,
        });

        parsedIndex.links.forEach((link) => {
            if (link.title) {
                link.title = liquidField(link.title, combinedVars, path);
            }
            if (link.description) {
                link.description = liquidField(link.description, combinedVars, path);
            }
        });

        await writeFile(filePath, dump(parsedIndex));
    } catch (error) {
        log.error(`Error while filtering index file: ${path}. Error message: ${error}`);
    }
}

export default {
    filterFile,
};
