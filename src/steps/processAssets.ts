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
import {Resources, YfmArgv} from '../models';
import {resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';

/**
 * @param {Array} args
 * @param {string} outputBundlePath
 * @param {string} outputFormat
 * @param {string} tmpOutputFolder
 * @return {void}
 */

type Props = {
    args: YfmArgv;
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

function processAssetsHtmlRun({outputBundlePath}: Pick<Props, 'outputBundlePath'>) {
    const {input: inputFolderPath, output: outputFolderPath, langs} = ArgvService.getConfig();

    const documentationAssetFilePath: string[] = walkSync(inputFolderPath, {
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    copyFiles(inputFolderPath, outputFolderPath, documentationAssetFilePath);

    const hasRTLlang = hasIntersection(langs ?? [], RTL_LANGS);
    const bundleAssetFilePath: string[] = walkSync(ASSETS_FOLDER, {
        directories: false,
        includeBasePath: false,
        ignore: hasRTLlang ? undefined : ['**/*.rtl.css'],
    });

    copyFiles(ASSETS_FOLDER, outputBundlePath, bundleAssetFilePath);
}

function processAssetsMdRun({args, tmpOutputFolder}: Pick<Props, 'args' | 'tmpOutputFolder'>) {
    const {input: inputFolderPath, allowCustomResources, resources} = ArgvService.getConfig();

    // FIXME: The way we merge parameters from two Argv sources breaks type safety here
    // @ts-expect-error
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

    const tocYamlFiles = TocService.getNavigationPaths()
        .filter((file) => file.endsWith('.yaml'))
        .map((file) => resolve(inputFolderPath, file));

    tocYamlFiles.forEach((yamlFile) => {
        const content = load(readFileSync(yamlFile, 'utf8'));

        if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
            return;
        }

        // FIXME: Better type cast than `object` would be appreciated
        const contentLinks = findAllValuesByKeys(content as object, LINK_KEYS);
        const localMediaLinks = contentLinks
            .filter((link) => {
                const linkHasMediaExt = new RegExp(
                    /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm,
                ).test(link);

                return linkHasMediaExt && isLocalUrl(link) && checkPathExists(link, yamlFile);
            })
            .map((link) => {
                const linkAbsolutePath = resolveRelativePath(yamlFile, link);

                return linkAbsolutePath.replace(`${inputFolderPath}${sep}`, '');
            });

        copyFiles(args.input, tmpOutputFolder, localMediaLinks);
    });
}

function hasIntersection(array1: unknown[], array2: unknown[]) {
    const set1 = new Set(array1);
    return array2.some((element) => set1.has(element));
}
