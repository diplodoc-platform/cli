import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {VcsServiceConfig} from '~/core/vcs';

import {uniq} from 'lodash';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {defined, toggleable} from '~/core/config';
import {get} from '~/core/utils';

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
            config.mtimes = toggleable('mtimes', args, config);
            config.authors = toggleable('authors', args, config);
            config.contributors = toggleable('contributors', args, config);

            if (defined('ignoreAuthor', args)) {
                config.authors.ignore = args.ignoreAuthor as string[];
                config.contributors.ignore = args.ignoreAuthor as string[];
            }

            if (config.authors.ignore && !Array.isArray(config.authors.ignore)) {
                config.authors.ignore = [].concat(config.authors.ignore);
            }

            if (config.contributors.ignore && !Array.isArray(config.contributors.ignore)) {
                config.contributors.ignore = [].concat(config.contributors.ignore);
            }

            return config;
        });

        getBaseHooks<Run>(program).BeforeAnyRun.tap('Contributors', (run) => {
            getLeadingHooks(run.leading).Dump.tapPromise(
                {name: 'Contributors', stage: -1},
                async (vfile) => {
                    const rawDeps = await run.leading.deps(vfile.path);
                    const deps = uniq(rawDeps.map(({path}) => path));

                    run.meta.add(vfile.path, await run.vcs.metadata(vfile.path, deps));
                },
            );

            getMarkdownHooks(run.markdown).Dump.tapPromise(
                {name: 'Contributors', stage: -1},
                async (vfile) => {
                    const rawDeps = await run.markdown.deps(vfile.path);
                    const deps = uniq(rawDeps.map(get('path')));
                    const meta = await run.vcs.metadata(vfile.path, deps);

                    run.meta.add(vfile.path, meta);
                    run.meta.addResources(vfile.path, meta);
                },
            );
        });
    }
}
