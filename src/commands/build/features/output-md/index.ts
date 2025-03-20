import type {Build, Run} from '~/commands/build';
import type {LeadingPage} from '~/core/leading';

import {join} from 'node:path';
import {uniq} from 'lodash';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath} from '~/core/config';
import {all, isMediaLink} from '~/core/utils';

import {getCustomCollectPlugins} from './utils';

export class OutputMd {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                getTocHooks(run.toc).Resolved.tapPromise('Build.Md', async (_toc, path) => {
                    await run.write(join(run.output, path), dump(await run.toc.dump(path)));
                });

                getMarkdownHooks(run.markdown).Collects.tap('Build.Md', (plugins) => {
                    return plugins.concat(getCustomCollectPlugins());
                });

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Build.Md',
                    async (markdown, path) => {
                        const meta = await run.meta.dump(path);
                        const dumped = dump(meta).trim();

                        if (dumped === '{}') {
                            return markdown;
                        }

                        return `---\n${dumped}\n---\n${markdown}`;
                    },
                );

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Build.Md',
                    async (markdown, file) => {
                        const deps = uniq((await run.markdown.deps(file)).map(({path}) => path));

                        await all(
                            deps.map(async (path) => {
                                await this.copyDependency(run, path, [file]);
                            }),
                        );

                        return markdown;
                    },
                );

                getLeadingHooks(run.leading).Dump.tapPromise(
                    'Build.Md',
                    this.copyAssets<LeadingPage>(run, run.leading),
                );

                getMarkdownHooks(run.markdown).Dump.tapPromise(
                    'Build.Md',
                    this.copyAssets<string>(run, run.markdown),
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

    private async copyDependency(run: Run, path: NormalizedPath, from: NormalizedPath[]) {
        try {
            run.logger.copy(join(run.input, path), join(run.output, path));
            const markdown = await run.markdown.load(path, from);
            await run.write(join(run.output, path), markdown);
        } catch (error) {
            run.logger.warn(`Unable to copy dependency ${path}.`, error);
        }
    }

    private copyAssets<T>(run: Run, service: Run['leading'] | Run['markdown']) {
        return async (content: T, file: NormalizedPath): Promise<T> => {
            const assets = await service.assets(file);

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

            return content;
        };
    }
}
