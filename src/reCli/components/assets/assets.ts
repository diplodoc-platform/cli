import fs from 'node:fs';
import path from 'node:path';
import {BuildConfig, Run} from '~/commands/build';
import {findAllValuesByKeys, logger} from '~/utils';
import {cachedMkdir, fileExists, safePath} from '~/reCli/utils';
import {ASSETS_FOLDER, BUNDLE_FOLDER, LINT_CONFIG_FILENAME, REDIRECTS_FILENAME} from '~/constants';
import pMap from 'p-map';
import yaml from 'js-yaml';
import {LINK_KEYS} from '@diplodoc/client/ssr';
import {isLocalUrl} from '@diplodoc/transform/lib/utils';
import {CONCURRENCY} from '~/reCli/constants';
import shell from 'shelljs';

interface CopyAssetsProps {
    run: Run;
    options: BuildConfig;
    cwd: string;
    targetCwd: string;
    pages: string[];
    logger: typeof logger;
}

export async function copyAssets(props: CopyAssetsProps) {
    const {outputFormat} = props.options;
    switch (outputFormat) {
        case 'md': {
            await copyMd2MdAssets(props);
            break;
        }
        case 'html': {
            await copyMd2HtmlAssets(props);
            break;
        }
    }
}

export async function copyMd2MdAssets(props: CopyAssetsProps) {
    const {cwd, targetCwd, pages, logger, options} = props;
    const {config: configPath, allowCustomResources, resources} = options;

    if (await fileExists(configPath)) {
        await fs.promises.cp(configPath, path.join(targetCwd, path.basename(configPath)));
    }

    await Promise.all(
        [REDIRECTS_FILENAME, LINT_CONFIG_FILENAME].map(async (file) => {
            const filePlace = path.join(cwd, file);
            if (await fileExists(filePlace)) {
                await fs.promises.cp(filePlace, path.join(targetCwd, file));
            }
        }),
    );

    const assetFiles: string[] = [];

    if (allowCustomResources && resources) {
        Object.entries(resources).forEach(([key, value]) => {
            if (key === 'csp') return;
            assetFiles.push(...(value ?? []));
        });
    }

    const yamlPages = pages.filter((page) => path.extname(page) === '.yaml');
    await pMap(
        yamlPages,
        async (pagePath) => {
            const content = yaml.load(
                await fs.promises.readFile(path.join(cwd, pagePath) as AbsolutePath, 'utf8'),
            ) as object;

            if (!Object.prototype.hasOwnProperty.call(content, 'blocks')) {
                return;
            }

            const contentLinks = findAllValuesByKeys(content, LINK_KEYS).filter(
                (link) =>
                    isLocalUrl(link) && /^\S.*\.(svg|png|gif|jpg|jpeg|bmp|webp|ico)$/gm.test(link),
            );

            contentLinks.forEach((link) => {
                assetFiles.push(path.relative(pagePath, link));
            });
        },
        {concurrency: CONCURRENCY},
    );

    await pMap(
        assetFiles,
        async (assetFile) => {
            const sourcePath = path.join(cwd, safePath(assetFile));
            if (await fileExists(sourcePath)) {
                logger.info(`Copying md asset file ${assetFile}`);
                const targetPlace = path.join(targetCwd, safePath(assetFile));
                await cachedMkdir(path.dirname(targetPlace));
                shell.cp(sourcePath, targetPlace);
            }
        },
        {concurrency: CONCURRENCY},
    );
}

export async function copyMd2HtmlAssets(props: CopyAssetsProps) {
    const {cwd, targetCwd, logger, run} = props;

    const assetFiles: string[] = await run.glob('**', {
        ignore: ['**/*.yaml', '**/*.md'],
        cwd: cwd as AbsolutePath,
    });

    await pMap(
        assetFiles,
        async (assetFile) => {
            if (await fileExists(path.join(cwd, assetFile))) {
                logger.info(`Copying html asset file ${assetFile}`);
                const targetPath = path.join(targetCwd, assetFile);
                await cachedMkdir(path.dirname(targetPath));
                shell.cp(path.join(cwd, assetFile), targetPath);
            }
        },
        {concurrency: CONCURRENCY},
    );

    const bundleAssetFilePath = await run.glob('**', {
        cwd: ASSETS_FOLDER,
    });

    await pMap(
        bundleAssetFilePath,
        async (assetFile) => {
            logger.info(`Copying bundle asset file ${assetFile}`);
            const targetPath = path.join(targetCwd, BUNDLE_FOLDER, assetFile);
            await cachedMkdir(path.dirname(targetPath));
            shell.cp(path.join(ASSETS_FOLDER, assetFile), targetPath);
        },
        {concurrency: CONCURRENCY},
    );
}
