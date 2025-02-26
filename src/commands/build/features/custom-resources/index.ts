import type {Build, Run} from '~/commands/build';
import type {Meta} from '~/core/meta';

import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

const name = 'CustomResources';

export class CustomResources {
    apply(program: Build) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap(name, async (run) => {
            const {allowCustomResources} = run.config;

            if (!allowCustomResources) {
                return;
            }

            getLeadingHooks(run.leading).Loaded.tap(name, this.addResources(run));
            getMarkdownHooks(run.markdown).Loaded.tap(name, this.addResources(run));
        });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise(name, async (run) => {
                const {allowCustomResources, resources} = run.config;

                if (!allowCustomResources) {
                    return;
                }

                for (const file of [...(resources.script || []), ...(resources.style || [])]) {
                    try {
                        await run.copy(join(run.input, file), join(run.output, file));
                    } catch (error) {
                        // TODO: Move to error strategy
                        run.logger.warn(`Unable to copy resource asset ${file}.`, error);
                    }
                }
            });
    }

    private addResources(run: Run) {
        const {resources} = run.config;

        return (_content: unknown, meta: Meta, path: NormalizedPath) => {
            run.meta.addResources(path, resources);
            run.meta.addResources(path, meta);
        };
    }
}
