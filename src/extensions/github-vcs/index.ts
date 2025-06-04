import type {BaseArgs, BaseConfig, BaseProgram, IExtension} from '@diplodoc/cli/lib/program';
import type {Run as BaseRun} from '@diplodoc/cli/lib/run';
import type {VcsService} from '@diplodoc/cli/lib/vcs';
import type {Args, Config} from './connector';

import {ok} from 'node:assert';
import simpleGit from 'simple-git';
import {getHooks as getBaseHooks} from '@diplodoc/cli/lib/program';
import {getHooks as getVcsHooks} from '@diplodoc/cli/lib/vcs';
import {setExt} from '@diplodoc/cli/lib/utils';

import {GithubVcsConnector} from './connector';
import {options} from './config';

type Run = BaseRun<Config> & {
    vcs?: VcsService;
};

export class Extension implements IExtension {
    apply(program: BaseProgram<BaseConfig & Config, BaseArgs & Args>) {
        getBaseHooks<Run>(program).BeforeAnyRun.tap('GithubVcsConnector', (run) => {
            getVcsHooks(run.vcs).VcsConnector.tapPromise(
                'GithubVcsConnector',
                async (_connector) => {
                    const connector = new GithubVcsConnector(run);

                    return connector.init();
                },
            );
        });

        getBaseHooks(program).Command.tap('GithubVcsConnector', async (command) => {
            command.addOption(options.vcsRepo);
            command.addOption(options.vcsOwner);
            command.addOption(options.vcsEndpoint);
            command.addOption(options.vcsBranch);
            command.addOption(options.vcsInitialCommit);
        });

        getBaseHooks(program).Config.tapPromise('GithubVcsConnector', async (config, args) => {
            const remote = await resolveRemote({baseDir: config.input});

            if (!config.vcs.enabled) {
                return config;
            }

            config.vcs.endpoint = args.vcsEndpoint || config.vcs.endpoint;
            config.vcs.owner = args.vcsOwner || config.vcs.owner || remote.owner || '';
            config.vcs.repo = args.vcsRepo || config.vcs.repo || remote.repo || '';
            config.vcs.branch = args.vcsBranch || config.vcs.branch;
            config.vcs.initialCommit = args.vcsInitialCommit || config.vcs.initialCommit;

            ok(config.vcs.owner, 'Unable to resolve config.vcs.owner');
            ok(config.vcs.repo, 'Unable to resolve config.vcs.repo');

            return config;
        });
    }
}

async function resolveRemote(gitOptions: {baseDir: AbsolutePath}) {
    try {
        const remote = await simpleGit(gitOptions).raw('remote', 'get-url', 'origin');

        if (!remote) {
            return {};
        }

        const [endpoint, rest] = remote.split(':');
        const [owner, repo] = setExt(rest, '').split('/');

        return {endpoint, owner, repo};
    } catch {
        return {};
    }
}
