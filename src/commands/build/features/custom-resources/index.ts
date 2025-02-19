import type {Build, Run} from '~/commands/build';

import {join} from 'node:path';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getLeadingHooks} from '~/core/leading';

const name = 'CustomResources';

export class CustomResources {
    apply(program: Build) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap(name, async (run) => {
            const {allowCustomResources, resources} = run.config;

            if (!allowCustomResources) {
                return;
            }

            getLeadingHooks(run.leading).Resolved.tap(name, (_leading, meta, path) => {
                run.meta.addResources(path, meta);
                run.meta.addResources(path, resources);
            });
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
}
