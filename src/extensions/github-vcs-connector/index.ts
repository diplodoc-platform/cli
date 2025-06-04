import type {BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
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
    apply(program: BaseProgram<BaseConfig & Config>) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap('GithubVcsConnector', (run) => {
            getVcsHooks(run.vcs).VcsConnector.tapPromise(
                'GithubVcsConnector',
                async (_connector) => {
                    const connector = new GithubVcsConnector(run);

                    return connector.init();
                },
            );
        });
    }
}
