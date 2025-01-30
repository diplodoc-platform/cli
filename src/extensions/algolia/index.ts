import type {BaseConfig, IBaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {SearchServiceConfig} from '@diplodoc/cli/lib/search/SearchService';
import type {IndexSettings, SearchParamsObject} from 'algoliasearch';

import {getHooks as getBuildHooks} from '@diplodoc/cli/commands/build';
import {getHooks as getSearchHooks} from '@diplodoc/cli/lib/search';

import {AlgoliaSearchProvider} from './provider';
import {join} from 'node:path';

const API_LINK = '_search/api.js';

export type AlgoliaSearchConfig = BaseConfig &
    SearchServiceConfig & {
        search: {
            appId: string;
            apiKey: string;
            searchKey: string;
            indexPrefix: string;
            index?: boolean;
            indexSettings?: Partial<IndexSettings>;
            querySettings?: Partial<SearchParamsObject>;
        };
    };

export class Extension implements IExtension {
    apply(program: IBaseProgram<AlgoliaSearchConfig>) {
        let enabled = false;

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('AlgoliaSearch', (run) => {
                getSearchHooks<AlgoliaSearchConfig['search']>(run.search)
                    .Provider.for('algolia')
                    .tap('AlgoliaSearch', (_connector, config) => {
                        enabled = true;

                        return new AlgoliaSearchProvider(run, {
                            ...config,
                            api: API_LINK,
                        });
                    });
            });

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('AlgoliaSearch', async (run) => {
                if (enabled) {
                    await run.copy(join(__dirname, 'algolia-api.js'), join(run.output, API_LINK));
                }
            });
    }
}
