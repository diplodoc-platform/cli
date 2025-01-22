import type {Build} from '~/commands';
import type {Command} from '~/core/config';
import {defined} from '~/core/config';
import {options} from './config';

export type ChangelogsArgs = {
    changelogs: boolean | string;
};

export type ChangelogsConfig = {
    changelogs: boolean | string;
};

export class Changelogs {
    apply(program: Build) {
        program.hooks.Command.tap('Changelogs', (command: Command) => {
            command.addOption(options.changelogs);
        });

        program.hooks.Config.tap('Changelogs', (config, args) => {
            config.changelogs = defined('changelogs', args, config) || false;

            return config;
        });
    }
}
