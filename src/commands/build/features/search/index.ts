import type {Build} from '~/commands';
import type {Command} from '~/core/config';

import {valuable} from '~/core/config';
import {options} from './config';

export type SearchArgs = {
    search: boolean;
};

export type SearchRawConfig = {
    search: boolean | Config;
};

export type SearchConfig = {
    search: Config;
};

type Config = {
    enabled: boolean;
    provider: string;
} & {
    [prop: string]: unknown;
};

export class Search {
    apply(program: Build) {
        program.hooks.Command.tap('Search', (command: Command) => {
            command.addOption(options.search);
        });

        program.hooks.Config.tap('Search', (config, args) => {
            let search: Config | boolean = {
                enabled: false,
                provider: 'local',
            };

            if (valuable(config.search)) {
                search = config.search;
            }

            if (typeof search === 'boolean') {
                search = {
                    enabled: search,
                    provider: 'local',
                };
            }

            if (valuable(args.search)) {
                search.enabled = Boolean(args.search);
            }

            config.search = search;

            return config;
        });
    }
}
