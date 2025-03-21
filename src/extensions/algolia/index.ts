import type {BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {SearchServiceConfig} from '@diplodoc/cli';
import type {IndexSettings, SearchParamsObject} from 'algoliasearch';

import {getBuildHooks, getSearchHooks} from '@diplodoc/cli';

import {AlgoliaSearchProvider} from './provider';

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
    apply(program: BaseProgram<AlgoliaSearchConfig>) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('AlgoliaSearch', (run) => {
                getSearchHooks<AlgoliaSearchConfig['search']>(run.search)
                    .Provider.for('algolia')
                    .tap('AlgoliaSearch', (_connector, config) => {
                        return new AlgoliaSearchProvider(run, {
                            ...config,
                            api: API_LINK,
                        });
                    });
            });
    }
}
