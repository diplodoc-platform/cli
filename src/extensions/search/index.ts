import type {BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {ProviderConfig} from './provider';

import {join} from 'node:path';
import {getHooks as getBuildHooks} from '@diplodoc/cli/commands/build';
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

        getBuildHooks(program)
            .AfterRun.for('html')
            .tapPromise('LocalSearch', async (run) => {
                if (run.search.enabled) {
                    await run.copy(
                        join(run.assetsPath, 'search-extension', 'api.js'),
                        join(run.output, API_LINK),
                    );
                }
            });
    }
}
