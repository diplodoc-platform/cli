import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {valuable} from '~/core/config';
import {langFromPath} from '~/core/utils';
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
        getBaseHooks(program).Command.tap('Search', (command: Command) => {
            command.addOption(options.search);
        });

        // Normalize search config
        getBaseHooks(program).Config.tap('Search', (config, args) => {
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

            search.enabled = search.enabled !== false && Boolean(search.provider);
            config.search = search;

            return config;
        });

        // Add entry result to search index
        getBuildHooks(program)
            .Entry.for('html')
            .tapPromise('Search', async (run, entry, info) => {
                const lang = langFromPath(entry, run.config);
                // @ts-ignore
                await run.search.add(entry, lang, info);
            });
    }
}
