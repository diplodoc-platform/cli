import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {getHooks as getBaseHooks} from '~/core/program';
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
        getBaseHooks(program).Command.tap('Changelogs', (command: Command) => {
            command.addOption(options.changelogs);
        });

        getBaseHooks(program).Config.tap('Changelogs', (config, args) => {
            config.changelogs = defined('changelogs', args, config) || false;

            return config;
        });
    }
}
