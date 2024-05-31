import type {Build} from '../..';
import type {Command} from '~/config';
import {defined} from '~/config';
import {options} from './config';

export type ContributorsArgs = {
    contributors?: boolean;
    ignoreAuthorPatterns?: string[];
};

export type ContributorsConfig = {
    contributors: boolean;
    ignoreAuthorPatterns: string[];
};

export class Contributors {
    apply(program: Build) {
        program.hooks.Command.tap('Contributors', (command: Command) => {
            command.addOption(options.contributors);
            command.addOption(options.ignoreAuthorPatterns);
        });

        program.hooks.Config.tap('Contributors', (config, args) => {
            config.contributors = defined('contributors', args, config) || false;
            config.ignoreAuthorPatterns = defined('ignoreAuthorPatterns', args, config) || [];

            return config;
        });
    }
}
