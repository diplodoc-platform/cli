import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VcsServiceConfig} from '~/core/vcs';

import {uniq} from 'lodash';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {defined, toggleable} from '~/core/config';

import {options} from './config';

export type ContributorsArgs = {
    mtimes?: {enabled: boolean};
    authors?: {enabled: boolean; ignore: string[]};
    contributors?: {enabled: boolean; ignore: string[]};
    ignoreAuthor?: string[];
};

export type ContributorsConfig = VcsServiceConfig;

export class Contributors {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Contributors', (command: Command) => {
            command.addOption(options.mtimes);
            command.addOption(options.authors);
            command.addOption(options.contributors);
            command.addOption(options.ignoreAuthor);
        });

        getBaseHooks(program).Config.tap('Contributors', (config, args) => {
            config.vcs = defined('vcs', config) || {enabled: false};
            config.mtimes = toggleable('mtimes', args, config);
            config.authors = toggleable('authors', args, config);
            config.contributors = toggleable('contributors', args, config);

            if (defined('ignoreAuthor', args)) {
                config.authors.ignore = args.ignoreAuthor as string[];
                config.contributors.ignore = args.ignoreAuthor as string[];
            }

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('Contributors', (run) => {
            getLeadingHooks(run.leading).Dump.tapPromise(
                {name: 'Contributors', stage: -1},
                async (vfile) => {
                    const rawDeps = await run.leading.deps(vfile.path);
                    const deps = uniq(rawDeps.map(({path}) => path));

                    run.meta.add(
                        vfile.path,
                        await run.vcs.metadata(vfile.path, run.meta.get(vfile.path), deps),
                    );
                },
            );

            getMarkdownHooks(run.markdown).Dump.tapPromise(
                {name: 'Contributors', stage: -1},
                async (vfile) => {
                    const rawDeps = await run.markdown.deps(vfile.path);
                    const deps = uniq(rawDeps.map(({path}) => path));

                    run.meta.add(
                        vfile.path,
                        await run.vcs.metadata(vfile.path, run.meta.get(vfile.path), deps),
                    );
                },
            );
        });
    }
}
