import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {ProviderConfig} from './provider';

import {getBuildHooks, getSearchHooks} from '@diplodoc/cli';

import {LocalSearchProvider} from './provider';

export class Extension implements IExtension {
    apply(program: BaseProgram) {
        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('LocalSearch', (run) => {
                getSearchHooks<ProviderConfig>(run.search)
                    .Provider.for('local')
                    .tap('LocalSearch', (_connector, config) => {
                        const provider = new LocalSearchProvider(run, config);

                        return provider;
                    });
            });
    }
}
