import type {Run} from '~/commands/build';

import walkSync from 'walk-sync';
import {load} from 'js-yaml';
import {readFileSync} from 'fs';
import {join, relative} from 'path';

import {ArgvService, TocService} from '../services';
import {checkPathExists, copyFiles, findAllValuesByKeys} from '../utils';

import {DocLeadingPageData, LINK_KEYS} from '@diplodoc/client/ssr';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';

import {ASSETS_FOLDER} from '../constants';
import {Resources} from '../models';
import {resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';

/**
 * @param {Array} args
 * @param {string} outputBundlePath
 * @param {string} outputFormat
 * @param {string} tmpOutputFolder
 * @return {void}
 */

type Props = {
    run: Run;
    outputBundlePath: string;
    outputFormat: string;
    tmpOutputFolder: string;
};
/*
 * Processes assets files (everything except .md files)
 */
export function processAssets({run, outputFormat, outputBundlePath, tmpOutputFolder}: Props) {
    switch (outputFormat) {
        case 'html':
            processAssetsHtmlRun({outputBundlePath});
            break;
        case 'md':
            processAssetsMdRun({run, tmpOutputFolder});
            break;
    }
}

function processAssetsHtmlRun({outputBundlePath}) {
    const {input: inputFolderPath, output: outputFolderPath} = ArgvService.getConfig();

    const documentationAssetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    copyFiles(inputFolderPath, outputFolderPath, documentationAssetFilePath);

    const bundleAssetFilePath: string[] = walkSync(ASSETS_FOLDER, {
        directories: false,
        includeBasePath: false,
    });

    copyFiles(ASSETS_FOLDER, outputBundlePath, bundleAssetFilePath);
}

function processAssetsMdRun({run, tmpOutputFolder}: {run: Run; tmpOutputFolder: string}) {
    const {allowCustomResources, resources} = run.config;

    if (resources && allowCustomResources) {
        const resourcePaths: string[] = [];

        // collect paths of all resources
        Object.keys(resources).forEach((type) => {
            if (type === 'csp') {
                return;
            }

            resources[type as keyof Resources]?.forEach((path: string) => resourcePaths.push(path));
        });

        //copy resources
        copyFiles(run.originalInput, tmpOutputFolder, resourcePaths);
    }

    const tocYamlFiles = TocService.getNavigationPaths().reduce<string[]>((acc, file) => {
        if (file.endsWith('.yaml')) {
            acc.push(join(run.input, file));
        }
        return acc;
    }, [] as AbsolutePath[]);

    tocYamlFiles.forEach((yamlFile) => {
        const content = load(readFileSync(yamlFile, 'utf8'));

        if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
            return;
        }

        const contentLinks = findAllValuesByKeys(content as DocLeadingPageData, LINK_KEYS);
        const localMediaLinks = contentLinks.reduce(
            (acc: string[], link: string) => {
                const linkHasMediaExt = new RegExp(
                    /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm,
                ).test(link);

                if (linkHasMediaExt && isLocalUrl(link) && checkPathExists(link, yamlFile)) {
                    const linkAbsolutePath = resolveRelativePath(yamlFile, link);
                    const linkRootPath = relative(run.input, linkAbsolutePath);

                    acc.push(linkRootPath);
                }
                return acc;
            }, [] as RelativePath[]);

        copyFiles(run.originalInput, tmpOutputFolder, localMediaLinks);
    });
}
