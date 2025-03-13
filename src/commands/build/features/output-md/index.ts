import type {Build, Run} from '~/commands/build';

import {join} from 'node:path';
import {dump} from 'js-yaml';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath} from '~/core/config';

import {getCustomCollectPlugins} from '~/commands/build/features/output-md/utils';
import {isMediaLink} from '~/core/utils';

export class OutputMd {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', (run) => {
                getTocHooks(run.toc).Resolved.tapPromise('Build.Md', async (_toc, path) => {
                    await run.write(join(run.output, path), dump(await run.toc.dump(path)));
                });

                getMarkdownHooks(run.markdown).Collects.tap('Changelogs', (plugins) => {
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
            if (!isMediaLink(asset)) {
                return;
            }

            try {
                run.logger.copy(join(run.input, asset), join(run.output, asset));
                await run.copy(join(run.input, asset), join(run.output, asset));
            } catch (error) {
                // TODO: Move to error strategy
                run.logger.warn(`Unable to copy resource asset ${asset}.`, error);
            }
        };
    }
}
