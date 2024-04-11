import walkSync from 'walk-sync';
import {load} from 'js-yaml';
import {readFileSync} from 'fs';
import shell from 'shelljs';
import {join, resolve, sep} from 'path';

import {ArgvService, TocService} from '../services';
import {checkPathExists, copyFiles, findAllValuesByKeys} from '../utils';

import {LINK_KEYS} from '@diplodoc/client/ssr';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';

import {
    ASSETS_FOLDER,
    LINT_CONFIG_FILENAME,
    REDIRECTS_FILENAME,
    RTL_LANGS,
    YFM_CONFIG_FILENAME,
} from '../constants';
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
    args: string[];
    outputBundlePath: string;
    outputFormat: string;
    tmpOutputFolder: string;
};
/*
 * Processes assets files (everything except .md files)
 */
export function processAssets({args, outputFormat, outputBundlePath, tmpOutputFolder}: Props) {
    switch (outputFormat) {
        case 'html':
            processAssetsHtmlRun({outputBundlePath});
            break;
        case 'md':
            processAssetsMdRun({args, tmpOutputFolder});
            break;
    }
}

function processAssetsHtmlRun({outputBundlePath}) {
    const {input: inputFolderPath, output: outputFolderPath, langs} = ArgvService.getConfig();

    const documentationAssetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    copyFiles(inputFolderPath, outputFolderPath, documentationAssetFilePath);

    const hasRTLlang = hasIntersection(langs, RTL_LANGS);
    const bundleAssetFilePath: string[] = walkSync(ASSETS_FOLDER, {
        directories: false,
        includeBasePath: false,
        ignore: !hasRTLlang && ['**/*.rtl.css'],
    });

    copyFiles(ASSETS_FOLDER, outputBundlePath, bundleAssetFilePath);
}

function processAssetsMdRun({args, tmpOutputFolder}) {
    const {input: inputFolderPath, allowCustomResources, resources} = ArgvService.getConfig();

    const pathToConfig = args.config || join(args.input, YFM_CONFIG_FILENAME);
    const pathToRedirects = join(args.input, REDIRECTS_FILENAME);
    const pathToLintConfig = join(args.input, LINT_CONFIG_FILENAME);

    shell.cp(resolve(pathToConfig), tmpOutputFolder);
    shell.cp(resolve(pathToRedirects), tmpOutputFolder);
    shell.cp(resolve(pathToLintConfig), tmpOutputFolder);

    if (resources && allowCustomResources) {
        const resourcePaths: string[] = [];

        // collect paths of all resources
        Object.keys(resources).forEach(
            (type) =>
                resources[type as keyof Resources]?.forEach((path: string) =>
                    resourcePaths.push(path),
                ),
        );

        //copy resources
        copyFiles(args.input, tmpOutputFolder, resourcePaths);
    }

    const tocYamlFiles = TocService.getNavigationPaths().reduce((acc, file) => {
        if (file.endsWith('.yaml')) {
            const resolvedPathToFile = resolve(inputFolderPath, file);

            acc.push(resolvedPathToFile);
        }
        return acc;
    }, []);

    tocYamlFiles.forEach((yamlFile) => {
        const content = load(readFileSync(yamlFile, 'utf8'));

        if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
            return;
        }

        const contentLinks = findAllValuesByKeys(content, LINK_KEYS);
        const localMediaLinks = contentLinks.reduce(
            (acc, link) => {
                const linkHasMediaExt = new RegExp(
                    /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm,
                ).test(link);

                if (linkHasMediaExt && isLocalUrl(link) && checkPathExists(link, yamlFile)) {
                    const linkAbsolutePath = resolveRelativePath(yamlFile, link);
                    const linkRootPath = linkAbsolutePath.replace(`${inputFolderPath}${sep}`, '');

                    acc.push(linkRootPath);
                }
                return acc;
            },

            [],
        );

        copyFiles(args.input, tmpOutputFolder, localMediaLinks);
    });
}

function hasIntersection(array1, array2) {
    const set1 = new Set(array1);
    return array2.some((element) => set1.has(element));
}
