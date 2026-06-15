import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';

import {join} from 'node:path';
import {flow} from 'lodash';

import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {THEME_ASSETS_PATH} from '~/constants';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {all, get, isMediaLink, shortLink} from '~/core/utils';

import {addMetaFrontmatter, getCustomCollectPlugins} from './utils';
import {MarkdownCollector} from './collect';
import {options} from './config';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    keepNotVar: boolean;
    legacyConditions: boolean;
    mergeIncludesSourceMaps: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    disableMetaMaxLineWidth: boolean;
    mergeIncludesSourceMaps: boolean;
};

export type PreprocessConfig = {
    template: {
        keepNotVar: boolean;
        legacyConditions: boolean;
    };
    preprocess: Partial<OutputMdConfig>;
};

export class OutputMd {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Build.Md', (command: Command) => {
            command.addOption(options.hashIncludes);
            command.addOption(options.mergeIncludes);
            command.addOption(options.mergeAutotitles);
            command.addOption(options.mergeSvg);
            command.addOption(options.keepNotVar);
            command.addOption(options.disableMetaMaxLineWidth);
            command.addOption(options.legacyConditions);
            command.addOption(options.mergeIncludesSourceMaps);
        });

        getBaseHooks(program).Config.tap('Build.Md', (config, args) => {
            const hashIncludes = defined('hashIncludes', args, config.preprocess || {}, {
                hashIncludes: true,
            });
            const mergeIncludes = defined('mergeIncludes', args, config.preprocess || {}, {
                mergeIncludes: true,
            });
            const mergeAutotitles = defined('mergeAutotitles', args, config.preprocess || {}, {
                mergeAutotitles: true,
            });
            const mergeSvg = defined('mergeSvg', args, config.preprocess || {}, {
                mergeSvg: true,
            });
            const keepNotVar = defined('keepNotVar', args, config || {}, {
                keepNotVar: false,
            });
            const legacyConditions = defined('legacyConditions', args, config || {}, {
                legacyConditions: false,
            });
            const disableMetaMaxLineWidth = defined('disableMetaMaxLineWidth', args, config || {}, {
                disableMetaMaxLineWidth: false,
            });
            const mergeIncludesSourceMaps = defined(
                'mergeIncludesSourceMaps',
                args,
                config.preprocess || {},
                {
                    mergeIncludesSourceMaps: true,
                },
            );
            return Object.assign(config, {
                template: {
                    ...config.template,
                    keepNotVar,
                    legacyConditions,
                },
                preprocess: {
                    hashIncludes,
                    mergeIncludes,
                    mergeAutotitles,
                    mergeSvg,
                    disableMetaMaxLineWidth,
                    mergeIncludesSourceMaps,
                },
            });
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                const config = run.config.preprocess;

                getMarkdownHooks(run.markdown).Collects.tap('Build.Md', (collects) => {
                    return collects.concat(getCustomCollectPlugins());
                });

                const copiedIncludes = new Set<string>();
                const copiedAssets = new Set<string>();

                getMetaHooks(run.meta).Dump.tap('Build.Md', (meta) => {
                    if (meta.alternate) {
                        // Expected type missing, to be compatible with old formats
                        // @ts-ignore
                        meta.alternate = meta.alternate.map(flow(get('href'), shortLink));
                    }

                    const hasTheme = run.exists(join(run.output, THEME_ASSETS_PATH));
                    if (hasTheme) {
                        meta.theme = THEME_ASSETS_PATH;
                    }

                    return meta;
                });

                // Recursively merge transformed markdown deps into a
                // self-contained document (see MarkdownCollector).
                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    {name: 'Build.Md', stage: -Infinity},
                    async (vfile) => {
                        const collector = new MarkdownCollector(
                            run,
                            run.config.preprocess,
                            copiedIncludes,
                        );

                        vfile.data = await collector.collect(vfile.path);
                    },
                );

                getLeadingHooks(run.leading).Dump.tapPromise('Build.Md', async (vfile) => {
                    vfile.data.meta = await run.meta.dump(vfile.path);
                });

                getMarkdownHooks(run.markdown).Dump.tapPromise('Build.Md', async (vfile) => {
                    const meta = await run.meta.dump(vfile.path);
                    const lineWidth = config.disableMetaMaxLineWidth ? Infinity : undefined;
                    vfile.data = addMetaFrontmatter(vfile.data, meta, lineWidth);
                });

                getLeadingHooks(run.leading).Dump.tapPromise(
                    'Build.Md',
                    this.copyAssets(run, run.leading, copiedAssets),
                );

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Build.Md',
                    this.copyAssets(run, run.markdown, copiedAssets),
                );
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Build.Md', async (run) => {
                // TODO: save normalized config instead
                if (run.config[configPath]) {
                    await run.copy(run.config[configPath], join(run.output, '.yfm'));
                }
            });
    }

    private copyAssets(run: Run, service: Run['leading'] | Run['markdown'], cache: Set<string>) {
        return async (vfile: {path: NormalizedPath}) => {
            const assets = await service.assets(vfile.path);

            await all(
                assets.map(async ({path, size}) => {
                    if (!isMediaLink(path)) {
                        return;
                    }

                    if (cache.has(path)) {
                        return;
                    }
                    cache.add(path);

                    if (run.toc.isEntry(path)) {
                        return;
                    }

                    if (typeof size === 'number' && size > run.config.content.maxAssetSize) {
                        run.logger.error(
                            'YFM013',
                            `${path}: YFM013 / File asset limit exceeded: ${size} (limit is ${run.config.content.maxAssetSize})`,
                        );
                    }

                    try {
                        run.logger.copy(join(run.input, path), join(run.output, path));
                        await run.copy(join(run.input, path), join(run.output, path));
                    } catch (error) {
                        run.logger.warn(`Unable to copy resource asset ${path}.`, error);
                    }
                }),
            );
        };
    }
}
