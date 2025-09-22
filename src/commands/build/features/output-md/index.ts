import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {EntryGraph} from '~/core/markdown';
import type {HashedGraphNode} from './utils';

import {join} from 'node:path';
import {dump} from 'js-yaml';
import {flow} from 'lodash';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMetaHooks} from '~/core/meta';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {all, get, isMediaLink, shortLink} from '~/core/utils';

import {Scheduler, getCustomCollectPlugins, rehashContent, signlink} from './utils';
import {options} from './config';
import {rehashIncludes} from './plugins/resolve-deps';
import {mergeAutotitles} from './plugins/merge-autotitles';
import {mergeSvg} from './plugins/merge-svg';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
    mergeSvg: boolean;
};

export type PreprocessConfig = {
    preprocess: Partial<OutputMdConfig>;
};

export class OutputMd {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Build.Md', (command: Command) => {
            command.addOption(options.hashIncludes);
            command.addOption(options.mergeIncludes);
            command.addOption(options.mergeAutotitles);
            command.addOption(options.mergeSvg);
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
                mergeSvg: false,
            });
            return Object.assign(config, {
                preprocess: {
                    hashIncludes,
                    mergeIncludes,
                    mergeAutotitles,
                    mergeSvg,
                },
            });
        });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
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

                                await run.write(join(run.output, link), hashed.content, true);
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
                    const dumped = dump(meta).trim();

                    if (dumped === '{}') {
                        return;
                    }

                    vfile.data = `---\n${dumped}\n---\n${vfile.data}`;
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
                assets.map(async ({path}) => {
                    if (!isMediaLink(path)) {
                        return;
                    }

                    if (cache.has(path)) {
                        return;
                    }
                    cache.add(path);

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
