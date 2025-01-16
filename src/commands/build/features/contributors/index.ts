import type {Build} from '~/commands/build';
import type {Command} from '~/config';
import type {VCSConnectorConfig} from '~/vcs-connector/connector-models';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/config';
import {options} from './config';

interface VCSConfiguration {
    /**
     * Externally accessible base URI for a resource where a particular documentation
     * source is hosted.
     *
     * This configuration parameter is used to directly control the Edit button behaviour
     * in the Diplodoc documentation viewer(s).
     *
     * For example, if the following applies:
     * - Repo with doc source is hosted on GitHub (say, https://github.com/foo-org/bar),
     * - Within that particular repo, the directory that is being passed as an `--input`
     *   parameter to the CLI is located at `docs/`,
     * - Whenever the Edit button is pressed, you wish to direct your readers to the
     *   respective document's source on `main` branch
     *
     * you should pass `https://github.com/foo-org/bar/tree/main/docs` as a value for this parameter.
     */
    remoteBase?: string;
    connector?: VCSConnectorConfig;
}

export type ContributorsArgs = {
    contributors?: boolean;
    ignoreAuthorPatterns?: string[];
};

export type ContributorsConfig = {
    vcs: VCSConfiguration;
    contributors: boolean;
    ignoreAuthorPatterns: string[];
};

export class Contributors {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Contributors', (command: Command) => {
            command.addOption(options.contributors);
            command.addOption(options.ignoreAuthorPatterns);
        });

        getBaseHooks(program).Config.tap('Contributors', (config, args) => {
            config.vcs = defined('vcs', config) || {};
            config.contributors = defined('contributors', args, config) || false;
            config.ignoreAuthorPatterns = defined('ignoreAuthorPatterns', args, config) || [];

            return config;
        });
    }
}
