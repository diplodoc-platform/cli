import type {Build, Run} from '~/commands/build';
import type {VFile} from '~/core/utils';
import type {EntryGraph} from '~/core/markdown';

import {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath} from '~/core/config';
import {all, isMediaLink} from '~/core/utils';

import {getCustomCollectPlugins, rehashContent, replaceDeps, signlink} from './utils';

export class OutputMd {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                getMarkdownHooks(run.markdown).Collects.tap('Build.Md', (collects) => {
                    return collects.concat(getCustomCollectPlugins());
                });

                // Recursively copy transformed markdown deps
                getMarkdownHooks(run.markdown).Dump.tapPromise('Build.Md', async (vfile) => {
                    const processed = new Map();
                    const entry = await run.markdown.graph(vfile.path);

                    vfile.data = (await dump(entry)).content;

                    async function dump(entry: EntryGraph, write = false) {
                        if (processed.has(entry.path)) {
                            return processed.get(entry.path);
                        }

                        const deps = await all(entry.deps.map((dep) => dump(dep, true)));
                        const content = replaceDeps(entry.content, deps);
                        const hash = rehashContent(content);
                        const link = signlink(entry.path, hash);
                        const hashed = {...entry, content, hash};

                        processed.set(entry.path, hashed);

                        if (write) {
                            try {
                                run.logger.copy(
                                    join(run.input, entry.path),
                                    join(run.output, link),
                                );

                                await run.write(join(run.output, link), content);
                            } catch (error) {
                                run.logger.warn(`Unable to copy dependency ${entry.path}.`, error);
                            }
                        }

                        return hashed;
                    }
                });

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
                    this.copyAssets(run, run.leading),
                );

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Build.Md',
                    this.copyAssets(run, run.markdown),
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

    private copyAssets(run: Run, service: Run['leading'] | Run['markdown']) {
        return async (vfile: VFile<any>) => {
            const assets = await service.assets(vfile.path);

            await all(
                assets.map(async (path) => {
                    if (!isMediaLink(path)) {
                        return;
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
