import type {Build} from '../../index';
import type {Command} from '../../../../config';

import {options} from './config';
import { defined } from '../../../../config/utils';

export type SinglePageArgs = {
    singlePage?: boolean;
};

export type SinglePageConfig = {
    singlePage: boolean;
};

export class SinglePage {
    apply(program: Build) {
        program.hooks.Command.tap('SinglePage', (command: Command) => {
            command.addOption(options.singlePage);
        });

        program.hooks.Config.tap('SinglePage', (config, args: SinglePageArgs) => {
            config.singlePage = defined('singlePage', args, config) || false;
        });
    }
}
