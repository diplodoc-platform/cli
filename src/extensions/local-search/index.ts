import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {ProviderConfig} from './provider';

import {getBuildHooks, getEntryHooks, getSearchHooks} from '@diplodoc/cli';

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

                        getEntryHooks(run.entry).State.tap('LocalSearch', (state) => {
                            state.search = provider.config(state.lang);
                        });

                        getEntryHooks(run.entry).Page.tap('LocalSearch', (template) => {
                            template.addCsp({
                                'worker-src': ["'self'"],
                            });
                            template.addScript(provider.resourcesLink(template.lang), {
                                position: 'state',
                            });
                        });

                        getSearchHooks(run.search).Page.tap('LocalSearch', (template) => {
                            template.addCsp({
                                'worker-src': ["'self'"],
                            });
                            template.addScript(provider.resourcesLink(template.lang), {
                                position: 'state',
                            });
                        });

                        return provider;
                    });
            });
    }
}
