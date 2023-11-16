import type {Build} from '../../index';
import type {Command} from '../../../../config';

import {options} from './config';
import {defined} from '../../../../config/utils';

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

        program.hooks.Config.tap('Contributors', (config, args: ContributorsArgs) => {
            config.contributors = defined('contributors', args, config) || false;
            config.ignoreAuthorPatterns = defined('ignoreAuthorPatterns', args, config) || [];
        });
    }
}
