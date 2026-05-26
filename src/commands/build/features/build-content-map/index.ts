import type {Command} from '~/core/config';
import type {Build, Run} from '~/commands/build';

import {getHooks as getBaseHooks} from '~/core/program';
import {valuable} from '~/core/config';

import {options} from './config';

export const CONTENT_MAP_FILENAME = 'yfm-build-content.json';
export const SCHEMA_VERSION = 1;

export type BuildContentMapArgs = {
    buildContent: boolean;
};

export type BuildContentMapConfig = {
    buildContent: boolean;
};

export class BuildContentMap {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('BuildContentMap', (command: Command) => {
            command.addOption(options.buildContent);
        });

        getBaseHooks(program).Config.tapPromise('BuildContentMap', async (config, args) => {
            let buildContent = false;

            if (valuable(config.buildContent)) {
                buildContent = Boolean(config.buildContent);
            }

            if (valuable(args.buildContent)) {
                buildContent = Boolean(args.buildContent);
            }

            config.buildContent = buildContent;

            return config;
        });

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise('BuildContentMap', async (run) => {
            if (!run.config.buildContent) {
                return;
            }
            // Implementation arrives in later tasks.
        });
    }
}
