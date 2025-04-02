import type {BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {SearchServiceConfig} from '@diplodoc/cli';

import {getBuildHooks, getSearchHooks} from '@diplodoc/cli';

import {AlgoliaJsonSearchProvider} from './provider';

export type AlgoliaJsonSearchConfig = BaseConfig &
    SearchServiceConfig & {
        search: {
            enabled: boolean;
            provider: 'algolia-json';
        };
    };

export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('AlgoliaJsonSearch', (run) => {
                getSearchHooks<AlgoliaJsonSearchConfig['search']>(run.search)
                    .Provider.for('algolia-json')
                    .tap('AlgoliaJsonSearch', (_connector, config) => {
                        return new AlgoliaJsonSearchProvider(run, {
                            api: 'algolia-json',
                            ...config,
                        });
                    });
            });
    }
}
