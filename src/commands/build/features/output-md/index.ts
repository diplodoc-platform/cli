import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VFile} from '~/core/utils';
import type {EntryGraph, IncludeInfo} from '~/core/markdown';

import {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {all, isMediaLink} from '~/core/utils';

import {Sheduler, getCustomCollectPlugins, rehashContent, signlink} from './utils';

import {options} from './config';
import {rehashIncludes} from './plugins/resolve-deps';
import {mergeAutotitles} from './plugins/links-autotitles';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
    mergeAutotitles: boolean;
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
            return Object.assign(config, {
                preprocess: {
                    hashIncludes,
                    mergeIncludes,
                    mergeAutotitles,
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

                // Recursively copy transformed markdown deps
                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    {name: 'Build.Md', stage: -Infinity},
                    async (vfile) => {
                        const processed = new Map();
                        const titles = new Map();

                        const config = run.config.preprocess;
                        const graph = await run.markdown.deps(vfile.path);

                        vfile.data = (await dump([vfile, graph])).content;

                        type Entry = [{path: NormalizedPath}, Dep[]];
                        type Dep = [IncludeInfo, Dep[]];

                        async function dump(
                            [info, deps]: Dep | Entry,
                            from?: NormalizedPath,
                            write = false,
                        ) {
                            if (processed.has(info.path)) {
                                return processed.get(info.path);
                            }

                            const _deps = await all(
                                deps.map((dep) => {
                                    if (Array.isArray(dep)) {
                                        return dump(dep as Dep, from || info.path, true);
                                    } else {
                                        return dump([dep, []], from || info.path, true);
                                    }
                                }),
                            );
                            let content = await run.markdown.load(info.path, from); //info.content;
                            const sheduler = new Sheduler();

                            if (!config.mergeIncludes && config.hashIncludes) {
                                sheduler.addStep(rehashIncludes(run, _deps));
                            }

                            if (config.mergeAutotitles) {
                                sheduler.addStep(mergeAutotitles(run, titles));
                            }

                            await sheduler.shedule(info as EntryGraph);
                            content = await sheduler.process(content);

                            const hash = config.hashIncludes ? rehashContent(content) : '';
                            const link = signlink(info.path, hash);
                            const hashed = {...info, content, hash};

                            processed.set(info.path, hashed);

                            if (copiedIncludes.has(link) || !write) {
                                return hashed;
                            }
                            copiedIncludes.add(link);

                            try {
                                run.logger.copy(join(run.input, info.path), join(run.output, link));

                                await run.write(join(run.output, link), content, true);
                            } catch (error) {
                                run.logger.warn(`Unable to copy dependency ${info.path}.`, error);
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
        return async (vfile: VFile<any>) => {
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
