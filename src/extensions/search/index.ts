import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {ProviderConfig} from './provider';

import {getBuildHooks} from '@diplodoc/cli';
import {getHooks as getSearchHooks} from '@diplodoc/cli/lib/search';

import {LocalSearchProvider} from './provider';

const API_LINK = '_search/api.js';

export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('LocalSearch', (run) => {
                getSearchHooks<ProviderConfig>(run.search)
                    .Provider.for('local')
                    .tap('LocalSearch', (_connector, config) => {
                        return new LocalSearchProvider(run, {
                            ...config,
                            api: API_LINK,
                        });
                    });
            });
    }
}
