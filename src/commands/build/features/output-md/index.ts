import type {Build} from '~/commands/build';

import {join} from 'node:path';
import {dump} from 'js-yaml';
import pmap from 'p-map';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getTocHooks} from '~/core/toc';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {isMediaLink} from '~/core/utils';
import {configPath} from '~/core/config';

export class OutputMd {
    apply(program: Build) {
        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Build.Md', async (run) => {
                getTocHooks(run.toc).Resolved.tapPromise('Build.Md', async (_toc, path) => {
                    await run.write(join(run.output, path), dump(await run.toc.dump(path)));
                });

                getLeadingHooks(run.leading).Asset.tapPromise(
                    'Build.Md',
                    async (asset: RelativePath) => {
                        if (!isMediaLink(asset)) {
                            return;
                        }

                        try {
                            await run.copy(join(run.input, asset), join(run.output, asset));
                        } catch (error) {
                            // TODO: Move to error strategy
                            run.logger.warn(`Unable to copy resource asset ${asset}.`, error);
                        }
                    },
                );

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Build.Md', async (run) => {
                // TODO: save normalized config instead
                if (run.config[configPath]) {
                    await run.copy(run.config[configPath], join(run.output, '.yfm'));
                }
            });
    }
}
