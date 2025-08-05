import type {Build, Run} from '~/commands/build';
import type {IncludeInfo} from '~/core/markdown';
import type {Command} from '~/core/config';
import type {VFile} from '~/core/utils';
import type {HashedGraphNode} from './utils';

import {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {all, isMediaLink} from '~/core/utils';

import {getCustomCollectPlugins, rehashContent, replaceDeps, signlink} from './utils';
import {options} from './config';

export type OutputMdArgs = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
};

export type OutputMdConfig = {
    hashIncludes: boolean;
    mergeIncludes: boolean;
};

export class OutputMd {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Build.Md', (command: Command) => {
            command.addOption(options.hashIncludes);
            command.addOption(options.mergeIncludes);
        });

        getBaseHooks(program).Config.tap('Build.Md', (config, args) => {
            config.hashIncludes = defined('hashIncludes', args, config, {hashIncludes: true});
            config.mergeIncludes = defined('mergeIncludes', args, config, {mergeIncludes: false});
            return config;
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
                        const {hashIncludes} = run.config;
                        const graph = await run.markdown.deps(vfile.path);

                        vfile.data = (await dump([vfile, graph])).content;

                        type Entry = [{path: NormalizedPath}, Dep[]];
                        type Dep = [IncludeInfo, Dep[]];

                        async function dump(
                            [info, deps]: Dep | Entry,
                            from?: NormalizedPath,
                            write = false,
                        ) {
                            const content = replaceDeps(
                                await run.markdown.load(info.path, from),
                                await all(
                                    deps.map((dep) => {
                                        if (Array.isArray(dep)) {
                                            return dump(dep as Dep, from || info.path, true);
                                        } else {
                                            return dump([dep, []], from || info.path, true);
                                        }
                                    }),
                                ),
                            );
                            const hash = hashIncludes ? rehashContent(content) : '';
                            const link = signlink(info.path, hash);
                            const hashed = {...info, content, hash};

                            if (copiedIncludes.has(link) || !write) {
                                return hashed as HashedGraphNode;
                            }
                            copiedIncludes.add(link);

                            try {
                                run.logger.copy(join(run.input, info.path), join(run.output, link));

                                await run.write(join(run.output, link), content, true);
                            } catch (error) {
                                run.logger.warn(`Unable to copy dependency ${info.path}.`, error);
                            }

                            return hashed as HashedGraphNode;
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
