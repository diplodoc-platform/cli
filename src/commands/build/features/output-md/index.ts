import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VFile} from '~/core/utils';
import type {EntryGraph} from '~/core/markdown';

import path, {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, defined} from '~/core/config';
import {all, isMediaLink} from '~/core/utils';

import {getCustomCollectPlugins, rehashContent, replaceDeps, signlink} from './utils';

import {options} from './config';
import {processAutotitle} from './plugins/links-autotitles';
import {processIncludes} from './plugins/includes';
import {inlineSVGImages} from './plugins/svg-inline';

const PREPROCESS_DEFAULTS = {
    replaceAutotitle: true,
    replaceIncludes: false,
    replaceSvg: false,
};

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
                        const processed = new Map();
                        const titleList = new Map();
                        const {replaceAutotitle, replaceIncludes, replaceSvg} = {
                            ...PREPROCESS_DEFAULTS,
                            ...(run.config.preprocess || {}),
                        };
                        const entry = await run.markdown.graph(vfile.path);

                        const processSteps = [
                            async (content: string, entryPath: RelativePath) => {
                                if (!replaceIncludes) {
                                    return content;
                                }

                                const baseDir = path.resolve(run.input);
                                return await processIncludes(
                                    content,
                                    path.resolve(path.join(run.input), entryPath),
                                    run.vars,
                                    baseDir,
                                );
                            },
                            async (content: string, entryPath: RelativePath) => {
                                if (!replaceAutotitle) {
                                    return content;
                                }

                                const assets = await run.markdown.assets(entryPath);
                                const links = assets.filter(asset => asset.autotitle === true && asset.type === 'link');

                                return await processAutotitle(content, getTitle, links);
                            },
                            async (content: string) => {
                                if (!replaceSvg) {
                                    return content;
                                }

                                const baseDir = path.resolve(run.input); //path.dirname(entry.path);
                                return await inlineSVGImages(content, baseDir);
                            },
                        ];

                        vfile.data = (await dump(entry)).content;

                        async function getTitle(link: string) {
                            if (link.startsWith('#')) {
                                link = `${entry.path}${link}`;
                            }
                            if (titleList.has(link)) {
                                return titleList.get(link);
                            }

                            const [href] = link.split('#');
                            const titles = await run.markdown.titles(
                                href as NormalizedPath,
                            );
                            for (const key in titles) {
                                if (key === '#') {
                                    titleList.set(href, titles[key]);
                                } else {
                                    titleList.set(href + key, titles[key]);
                                }
                            }

                            return titleList.get(link);
                        }

                        async function dump(entry: EntryGraph, write = false) {
                            if (processed.has(entry.path)) {
                                return processed.get(entry.path);
                            }

                            let content = entry.content;
                            if (!replaceIncludes) {
                                const deps = await all(entry.deps.map((dep) => dump(dep, true)));
                                content = replaceDeps(content, deps);
                            }

                            for (const step of processSteps) {
                                content = await step(content, entry.path);
                            }

                            const hash =
                                hashIncludes && !replaceIncludes ? rehashContent(content) : '';
                            const link = signlink(entry.path, hash);
                            const hashed = {...entry, content, hash};

                            processed.set(entry.path, hashed);

                            if (copiedIncludes.has(link) || !write) {
                                return hashed;
                            }
                            copiedIncludes.add(link);

                            try {
                                run.logger.copy(
                                    join(run.input, entry.path),
                                    join(run.output, link),
                                );

                                await run.write(join(run.output, link), content, true);
                            } catch (error) {
                                run.logger.warn(`Unable to copy dependency ${entry.path}.`, error);
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
