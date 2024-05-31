import walkSync from 'walk-sync';
import {load} from 'js-yaml';
import {readFileSync} from 'fs';
import shell from 'shelljs';
import {resolve} from 'path';
import {isFileExists, resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';
import {TocService} from '../services';
import {copyFiles, findAllValuesByKeys} from '../utils';

import {LINK_KEYS} from '@diplodoc/client/ssr';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';

import {ASSETS_FOLDER} from '../constants';
import {Resources} from '../models';
import {Run} from '~/commands/build';

/**
 * Processes assets files (everything except .md files)
 */
export function processAssets(run: Run) {
    switch (run.config.outputFormat) {
        case 'html':
            processAssetsHtmlRun(run);
            break;
        case 'md':
            processAssetsMdRun(run);
            break;
    }
}

function processAssetsHtmlRun(run: Run) {
    const documentationAssetFilePath: string[] = walkSync(run.input, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    const bundleAssetFilePath: string[] = walkSync(ASSETS_FOLDER, {
        directories: false,
        includeBasePath: false,
    });

    copyFiles(run.input, run.output, documentationAssetFilePath);
    copyFiles(ASSETS_FOLDER, run.bundlePath, bundleAssetFilePath);
}

function processAssetsMdRun(run: Run) {
    const {allowCustomResources, resources} = run.config;

    shell.cp(run.configPath, run.output);
    shell.cp(run.redirectsPath, run.output);

    if (resources && allowCustomResources) {
        const resourcePaths: string[] = [];

        // collect paths of all resources
        Object.keys(resources).forEach((type) =>
            resources[type as keyof Resources]?.forEach((path: string) => resourcePaths.push(path)),
        );

        //copy resources
        copyFiles(run.originalInput, run.output, resourcePaths);
    }

    const yamlFiles = TocService.getNavigationPaths().reduce((acc, file) => {
        if (file.endsWith('.yaml')) {
            const resolvedPathToFile = resolve(run.input, file);

            acc.push(resolvedPathToFile);
        }

        return acc;
    }, [] as string[]);

    const contentLinks = yamlFiles.reduce((acc, yamlFile) => {
        const content = load(readFileSync(yamlFile, 'utf8'));

        if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
            return acc;
        }

        return acc.concat((findAllValuesByKeys(content, LINK_KEYS) as string[])
            .filter((link) => isMediaLink(link) && isLocalUrl(link))
            .map((link) => resolveRelativePath(yamlFile, link))
            .filter((link) => isFileExists(link))
            .map((link) => link
                .replace(`${run.originalInput}`, '')
                .replace(/^[/\\]/, '')
            ));
    }, [] as string[]);

    copyFiles(run.input, run.output, [...new Set(contentLinks)]);
}

function isMediaLink(link: string) {
    return /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/.test(link);
}
