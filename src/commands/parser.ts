import type {BaseArgs} from '~/core/program';

import {Command} from '~/core/config';
import {YFM_CONFIG_FILENAME} from '~/constants';

import {NAME, options} from './config';

/**
 * Base parser, which handles {BaseArgs}
 */
export const parse = (argv: string[], name = NAME): BaseArgs => {
    const parser = new Command(name)
        .addOption(options.input('./'))
        .addOption(options.strict)
        .addOption(options.quiet)
        .addOption(options.jobs)
        .addOption(options.profile)
        .addOption(options.config(YFM_CONFIG_FILENAME))
        .addOption(options.extensions)
        .helpOption(false)
        .allowUnknownOption(true);

    return parser.parse(argv).opts();
};
