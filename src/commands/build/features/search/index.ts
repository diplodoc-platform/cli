import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {langFromPath} from '~/core/utils';

import {ExternalSearchProvider} from '../../services/search/external';
import {getHooks as getSearchHooks} from '../../services/search';
import {getHooks as getEntryHooks} from '../../services/entry';

import {normalizeSearch, options} from './config';

export type SearchArgs = {
    search: boolean;
    searchProvider: string;
    searchEndpoint: string;
    searchOptions: Record<string, string | number | boolean>;
};

export type SearchRawConfig = {
    search: boolean | Partial<Config>;
};

export type SearchConfig = {
    search: Config;
};

type Config = {
    enabled: boolean;
    provider: string;
    hiddenPolicy: boolean;
    endpoint?: string;
    options?: Record<string, string | number | boolean>;
} & {
    [prop: string]: unknown;
};

export class Search {
    apply(program: Build) {
        getBaseHooks(program).Command.tap({name: 'Search', stage: Infinity}, (command: Command) => {
            for (const option of Object.values(options)) {
                if (!command.options.some((registered) => registered.long === option.long)) {
                    command.addOption(option);
                }
            }
        });

        // Normalize search config
        getBaseHooks(program).Config.tap('Search', (config, args) => {
            const providerSource =
                program.command.getOptionValueSourceWithGlobals('searchProvider');
            config.search = normalizeSearch(config.search, {
                ...args,
                searchProvider: providerSource === 'default' ? undefined : args.searchProvider,
            });

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('ExternalSearch', (run) => {
                getSearchHooks(run.search)
                    .Provider.for('external')
                    .tap('ExternalSearch', () => {
                        const provider = new ExternalSearchProvider(run);
                        getEntryHooks(run.entry).State.tap('ExternalSearch', (state) => {
                            state.search = provider.config(state.lang);
                        });
                        getEntryHooks(run.entry).Page.tap('ExternalSearch', provider.configurePage);
                        getSearchHooks(run.search).Page.tap(
                            'ExternalSearch',
                            provider.configurePage,
                        );
                        return provider;
                    });
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
