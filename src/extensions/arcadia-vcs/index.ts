import type {BaseArgs, BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {VcsService} from '@diplodoc/cli/lib/vcs';
import type {Args, Config} from './types';

import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getVcsHooks} from '@diplodoc/cli/lib/vcs';

import {ArcadiaVcsConnector} from './connector';
import {options} from './config';

type Run = BaseRun<Config> & {
    vcs?: VcsService;
};

export class Extension implements IExtension {
    apply(program: BaseProgram<BaseConfig & Config, BaseArgs & Args>) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap('ArcadiaVcsConnector', (run) => {
            getVcsHooks(run.vcs).VcsConnector.tapPromise(
                {name: 'ArcadiaVcsConnector', stage: 10},
                async (_connector) => {
                    const connector = new ArcadiaVcsConnector(run);

                    return connector.init();
                },
            );
        });

        getBaseHooks(program).Command.tap('ArcadiaVcsConnector', (command) => {
            command.addOption(options.vcsScopes);
            command.addOption(options.vcsInitialCommit);
        });

        getBaseHooks(program).Config.tap('ArcadiaVcsConnector', (config, args) => {
            if (!config.vcs.enabled) {
                return config;
            }

            config.vcs.scopes = args.vcsScopes || config.vcs.scopes || [];
            config.vcs.initialCommit = args.vcsInitialCommit || config.vcs.initialCommit;

            return config;
        });
    }
}
