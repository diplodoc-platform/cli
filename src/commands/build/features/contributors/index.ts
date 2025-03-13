import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VcsServiceConfig} from '~/core/vcs';

import {uniq} from 'lodash';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {defined} from '~/core/config';

import {options} from './config';

export type ContributorsArgs = {
    mtimes?: boolean;
    authors?: boolean;
    contributors?: boolean;
    ignoreAuthorPatterns?: string[];
};

export type ContributorsConfig = VcsServiceConfig & {
    ignoreAuthorPatterns: string[];
};

export class Contributors {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Contributors', (command: Command) => {
            command.addOption(options.contributors);
            command.addOption(options.ignoreAuthorPatterns);
        });

        getBaseHooks(program).Config.tap('Contributors', (config, args) => {
            config.vcs = defined('vcs', config) || {enabled: false};
            config.mtimes = defined('mtimes', args, config) || false;
            config.authors = defined('authors', args, config) || false;
            config.contributors = defined('contributors', args, config) || false;
            config.ignoreAuthorPatterns = defined('ignoreAuthorPatterns', args, config) || [];

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('Contributors', (run) => {
            getLeadingHooks(run.leading).Resolved.tapPromise(
                'Contributors',
                async (_content, _meta, path) => {
                    run.meta.add(path, await run.vcs.metadata(path, run.meta.get(path)));
                },
            );

            getMarkdownHooks(run.markdown).Resolved.tapPromise(
                'Contributors',
                async (_content, path) => {
                    const rawDeps = await run.markdown.deps(path);
                    const deps = uniq(rawDeps.map(({path}) => path));

                    run.meta.add(path, await run.vcs.metadata(path, run.meta.get(path), deps));
                },
            );
        });
    }
}
