import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';
import type {Meta, Resources} from '~/core/meta';

import {join} from 'node:path';

import {defined} from '~/core/config';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';

import {options} from './config';

const name = 'CustomResources';

export type CustomResourcesArgs = {
    resources: Resources;
    allowCustomResources: boolean;
};

export type CustomResourcesConfig = {
    resources: Resources;
    allowCustomResources: boolean;
};

export class CustomResources {
    apply(program: Build) {
        getBaseHooks(program).Command.tap(name, (command: Command) => {
            command.addOption(options.resources);
            command.addOption(options.allowCustomResources);
        });

        getBaseHooks(program).Config.tap(name, (config, args) => {
            config.resources = defined('resources', args, config) || {};
            config.allowCustomResources = defined('allowCustomResources', args, config) || false;

            return config;
        });

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
