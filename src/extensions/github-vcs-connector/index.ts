import type {BaseConfig, IBaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {VcsService} from '@diplodoc/cli/lib/vcs';
import type {Config} from './connector';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getVcsHooks} from '@diplodoc/cli/lib/vcs';

import {GithubVcsConnector} from './connector';

type Run = BaseRun<Config> & {
    vcs?: VcsService;
};

export class Extension implements IExtension {
    apply(program: IBaseProgram<BaseConfig & Config>) {
        getBaseHooks(program).BeforeAnyRun.tap('GithubVcsConnector', (run: Run) => {
            getVcsHooks(run.vcs)
                .VcsConnector.for('github')
                .tapPromise('GithubVcsConnector', async (_connector) => {
                    const connector = new GithubVcsConnector(run);

                    return connector.init();
                });
        });
    }
}
