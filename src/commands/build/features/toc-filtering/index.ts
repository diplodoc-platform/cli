import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {options} from './config';

export type TocFilteringArgs = {
    removeHiddenTocItems: boolean;
    removeEmptyTocItems: boolean;
};

export type TocFilteringConfig = {
    removeHiddenTocItems: boolean;
    removeEmptyTocItems: boolean;
};

export class TocFiltering {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('TocFiltering', (command: Command) => {
            command.addOption(options.removeHiddenTocItems);
            command.addOption(options.removeEmptyTocItems);
        });

        // Process command line arguments and add them to config
        getBaseHooks(program).Config.tap('TocFiltering', (config, args) => {
            const removeHiddenTocItems = defined('removeHiddenTocItems', args, config);
            const removeEmptyTocItems = defined('removeEmptyTocItems', args, config);

            if (removeHiddenTocItems !== undefined) {
                config.removeHiddenTocItems = removeHiddenTocItems;
            }

            if (removeEmptyTocItems !== undefined) {
                config.removeEmptyTocItems = removeEmptyTocItems;
            }

            return config;
        });
    }
}
