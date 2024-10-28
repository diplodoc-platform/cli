import {load} from 'js-yaml';
import shell from 'shelljs';
import {join, resolve, sep} from 'path';

import {LINK_KEYS} from '@diplodoc/client/ssr';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';
import {resolveRelativePath} from '@diplodoc/transform/lib/utilsFS';

import {
    ASSETS_FOLDER,
    LINT_CONFIG_FILENAME,
    REDIRECTS_FILENAME,
    RTL_LANGS,
    YFM_CONFIG_FILENAME,
} from '~/constants';
import {ArgvService, TocService} from '~/services';
import {checkPathExists, copyFiles, findAllValuesByKeys, walk} from '~/utils';
import {Resources, YfmArgv} from '~/models';
import {RevisionContext} from '~/context/context';
import {FsContext} from '@diplodoc/transform/lib/typings';

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
    userOutputFolder: string;
    context: RevisionContext;
    fs: FsContext;
};

/*
 * Processes assets files (everything except .md files)
 */
export async function processAssets(props: Props) {
    switch (props.outputFormat) {
        case 'html':
            await processAssetsHtmlRun(props);
            break;
        case 'md':
            await processAssetsMdRun(props);
            break;
    }
}

async function processAssetsHtmlRun({outputBundlePath, context}: Props) {
    const {input: inputFolderPath, output: outputFolderPath, langs} = ArgvService.getConfig();

    const documentationAssetFilePath: string[] = walk({
        folder: inputFolderPath,
        directories: false,
        includeBasePath: false,
        ignore: ['**/*.yaml', '**/*.md'],
    });

    await copyFiles(inputFolderPath, outputFolderPath, documentationAssetFilePath, context.meta);

    if (!context?.shallow) {
        const hasRTLlang = hasIntersection(langs, RTL_LANGS);
        const bundleAssetFilePath: string[] = walk({
            folder: ASSETS_FOLDER,
            directories: false,
            includeBasePath: false,
            ignore: hasRTLlang ? undefined : ['**/*.rtl.css'],
        });

        await copyFiles(ASSETS_FOLDER, outputBundlePath, bundleAssetFilePath, context.meta);
    }
}

async function processAssetsMdRun({args, tmpOutputFolder, context, fs}: Props) {
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
        Object.keys(resources).forEach((type) =>
            resources[type as keyof Resources]?.forEach((path: string) => resourcePaths.push(path)),
        );

        // copy resources
        await copyFiles(args.input, tmpOutputFolder, resourcePaths, context.meta);
    }

    const tocYamlFiles = TocService.getNavigationPaths().reduce<string[]>((acc, file) => {
        if (file.endsWith('.yaml')) {
            const resolvedPathToFile = resolve(inputFolderPath, file);

            acc.push(resolvedPathToFile);
        }
        return acc;
    }, []);

    for (const yamlFile of tocYamlFiles) {
        const content = load(fs.read(yamlFile)) as object;

        if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
            return;
        }

        const contentLinks = findAllValuesByKeys(content, LINK_KEYS);
        const localMediaLinks = [];

        for (const link of contentLinks) {
            const linkHasMediaExt = new RegExp(
                /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm,
            ).test(link);

            if (
                linkHasMediaExt &&
                isLocalUrl(link) &&
                (await checkPathExists(fs, link, yamlFile))
            ) {
                const linkAbsolutePath = resolveRelativePath(yamlFile, link);
                const linkRootPath = linkAbsolutePath.replace(`${inputFolderPath}${sep}`, '');

                localMediaLinks.push(linkRootPath);
            }
        }

        await copyFiles(args.input, tmpOutputFolder, localMediaLinks, context.meta);
    }
}

function hasIntersection(array1: string[] | undefined | null, array2: string[] | undefined | null) {
    const set1 = new Set(array1);
    return array2?.some((element) => set1.has(element));
}
