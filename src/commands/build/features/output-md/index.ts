import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {EntryGraph} from '~/core/markdown';
import type {HashedGraphNode} from './utils';

import {join} from 'node:path';
import {flow} from 'lodash';

import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {all, get, isMediaLink, shortLink} from '~/core/utils';

import {
    Scheduler,
    addMetaFrontmatter,
    getCustomCollectPlugins,
    rehashContent,
    signlink,
} from './utils';
import {mergeSvg} from './plugins/merge-svg';
import {mergeAutotitles} from './plugins/merge-autotitles';
import {rehashIncludes} from './plugins/resolve-deps';
import {options} from './config';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    keepNotVar: boolean;
    legacyConditions: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
    disableMetaMaxLineWidth: boolean;
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
        });

        getBaseHooks(program).Config.tap('Build.Md', (config, args) => {
            const hashIncludes = defined('hashIncludes', args, config.preprocess || {}, {
                hashIncludes: true,
            });
            const mergeIncludes = defined('mergeIncludes', args, config.preprocess || {}, {
                mergeIncludes: false,
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

                    return meta;
                });

                // Recursively copy transformed markdown deps
                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    {name: 'Build.Md', stage: -Infinity},
                    async (vfile) => {
                        const processed = new Map();
                        const titles = new Map();
                        const svgList = new Map();

                        const config = run.config.preprocess;
                        const graph = await run.markdown.graph(vfile.path);

                        vfile.data = (await dump(graph)).content;

                        async function dump(graph: EntryGraph, write = false) {
                            // Cache by path instead of path+from is allowed here
                            // because from is already top level path here.
                            if (processed.has(graph.path)) {
                                return processed.get(graph.path);
                            }

                            const deps: HashedGraphNode[] = await all(
                                graph.deps.map((dep) => dump(dep, true)),
                            );
                            const scheduler = new Scheduler([
                                config.hashIncludes &&
                                    !config.mergeIncludes &&
                                    rehashIncludes(run, deps),
                                config.mergeAutotitles &&
                                    mergeAutotitles(run, titles, graph.assets),
                                config.mergeSvg && mergeSvg(run, svgList, graph.assets),
                            ]);

                            await scheduler.schedule(graph.path);

                            const content = await scheduler.process(graph.content);

                            const hash = config.hashIncludes ? rehashContent(content) : '';
                            const link = signlink(graph.path, hash);
                            const hashed = {...graph, deps, content, hash};

                            processed.set(graph.path, hashed);

                            if (copiedIncludes.has(link) || !write) {
                                return hashed;
                            }
                            copiedIncludes.add(link);

                            try {
                                run.logger.copy(
                                    join(run.input, graph.path),
                                    join(run.output, link),
                                );

                                // Add metadata frontmatter to include files.
                                // Without this, include files are written without YAML frontmatter,
                                // which causes a race condition when the same file is both a TOC entry
                                // and an include in another file. The last writer wins, and if the
                                // include is written after the entry, metadata (like __system) is lost.
                                const vars = run.vars.for(graph.path);
                                run.meta.addSystemVars(graph.path, vars.__system);
                                run.meta.addMetadata(graph.path, vars.__metadata);

                                const includeMeta = await run.meta.dump(graph.path);
                                const lineWidth = config.disableMetaMaxLineWidth
                                    ? Infinity
                                    : undefined;
                                const contentWithMeta = addMetaFrontmatter(
                                    hashed.content,
                                    includeMeta,
                                    lineWidth,
                                );

                                await run.write(join(run.output, link), contentWithMeta, true);
                            } catch (error) {
                                run.logger.warn(`Unable to copy dependency ${graph.path}.`, error);
                            }

                            return hashed;
                        }
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
