import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VcsServiceConfig} from '~/core/vcs';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {options} from './config';

export type ContributorsArgs = {
    contributors?: boolean;
    ignoreAuthorPatterns?: string[];
};

export type ContributorsConfig = VcsServiceConfig & {
    ignoreAuthorPatterns: string[];
};

export class Contributors {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Contributors', (command: Command) => {
            command.addOption(options.contributors);
            command.addOption(options.ignoreAuthorPatterns);
        });

        getBaseHooks(program).Config.tap('Contributors', (config, args) => {
            config.vcs = defined('vcs', config) || {};
            config.contributors = defined('contributors', args, config) || false;
            config.ignoreAuthorPatterns = defined('ignoreAuthorPatterns', args, config) || [];

            return config;
        });
    }
}
