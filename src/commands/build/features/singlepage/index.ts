import type {Build} from '~/commands';
import type {Command} from '~/config';
import {defined} from '~/config';
import {options} from './config';

export type SinglePageArgs = {
    singlePage: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
};

export class SinglePage {
    apply(program: Build) {
        program.hooks.Command.tap('SinglePage', (command: Command) => {
            command.addOption(options.singlePage);
        });

        program.hooks.Config.tap('SinglePage', (config, args) => {
            config.singlePage = defined('singlePage', args, config) || false;

            return config;
        });
    }
}
