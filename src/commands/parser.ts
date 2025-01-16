import type {BaseArgs} from '~/core/program';

import {Command} from '~/config';
import {YFM_CONFIG_FILENAME} from '~/constants';
import {options} from './config';

/**
 * Base parser, which handles {BaseArgs}
 */
export const parse = (name: string, argv: string[]): BaseArgs => {
    const parser = new Command(name)
        .addOption(options.input('./'))
        .addOption(options.strict)
        .addOption(options.quiet)
        .addOption(options.config(YFM_CONFIG_FILENAME))
        .addOption(options.extensions)
        .helpOption(false)
        .allowUnknownOption(true);

    return parser.parse(argv).opts();
};
