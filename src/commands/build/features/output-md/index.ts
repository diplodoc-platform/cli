import type {Build, Run} from '~/commands/build';

import {join} from 'node:path';
import {dump} from 'js-yaml';
import {dedent} from 'ts-dedent';
import pmap from 'p-map';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath} from '~/core/config';

import {getCustomCollectPlugins} from '~/commands/build/features/output-md/utils';

export class OutputMd {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                getTocHooks(run.toc).Resolved.tapPromise('Build.Md', async (_toc, path) => {
                    await run.write(join(run.output, path), dump(await run.toc.dump(path)));
                });

                getMarkdownHooks(run.markdown).Plugins.tap('Changelogs', (plugins) => {
                    return plugins.concat(getCustomCollectPlugins());
                });

                getLeadingHooks(run.leading).Asset.tapPromise('Build.Md', this.copyAssets(run));
                getMarkdownHooks(run.markdown).Asset.tapPromise('Build.Md', this.copyAssets(run));

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
                    async (markdown, path) => {
                        if (!run.config.mergeIncludes) {
                            return markdown;
                        }

                        const deps = await run.markdown.deps(path);
                        const contents = await pmap(deps, async ({path}) => {
                            const content = await run.markdown.load(path);

                            return dedent`
                                {% filepart (${path}) %}
                                ${content}
                                {% endfilepart %}
                            `;
                        });

                        return markdown + '\n\n' + contents;
                    },
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

    private copyAssets(run: Run) {
        return async (asset: NormalizedPath) => {
            try {
                await run.copy(join(run.input, asset), join(run.output, asset));
            } catch (error) {
                // TODO: Move to error strategy
                run.logger.warn(`Unable to copy resource asset ${asset}.`, error);
            }
        };
    }
}
