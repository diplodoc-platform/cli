import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {basename, dirname, extname, join} from 'node:path';
import pmap from 'p-map';
import changelog from '@diplodoc/transform/lib/plugins/changelog';

import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {defined} from '~/core/config';

import {collect} from './collect';
import {options} from './config';

export type ChangelogsArgs = {
    changelogs: boolean | string;
};

export type ChangelogsConfig = {
    changelogs: boolean | string;
};

export interface ChangelogItem {
    title: string;
    date?: string;
    index?: number;
    image: {
        src: string;
        alt: string;
        ratio?: string;
    };
    description: string;
    [x: string]: unknown;
}

export class Changelogs {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Changelogs', (command: Command) => {
            command.addOption(options.changelogs);
        });

        getBaseHooks(program).Config.tap('Changelogs', (config, args) => {
            config.changelogs = defined('changelogs', args, config) || false;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Changelogs', (run) => {
                getMarkdownHooks(run.markdown).Plugins.tap('Changelogs', (plugins) => {
                    return plugins.concat(changelog);
                });
            });

        getBuildHooks(program)
            .BeforeRun.for('md')
            .tap('Changelogs', (run) => {
                if (!run.config.changelogs) {
                    return;
                }

                const changelogs: ChangelogItem[] = [];

                getMarkdownHooks(run.markdown).Collects.tap('Changelogs', (plugins) => {
                    return plugins.concat(collect(changelogs));
                });

                getMarkdownHooks(run.markdown).Resolved.tapPromise(
                    'Changelogs',
                    async (_content, path) => {
                        // TODO: why we handle all changelogs?
                        if (!changelogs.length) {
                            return;
                        }

                        const filename = basename(path, extname(path));
                        const outputDir = dirname(join(run.output, path));

                        changelogs[changelogs.length - 1].source = join(dirname(path), filename);

                        await pmap(changelogs, (changes, index) => {
                            const changesName = changelogName(
                                filename,
                                changes,
                                changelogs.length - index,
                            );
                            const changesPath = join(
                                outputDir,
                                'changelogs',
                                `__changes-${changesName}.json`,
                            );

                            return run.write(
                                changesPath,
                                JSON.stringify(changes),
                            );
                        });
                    },
                );
            });
    }
}

function changelogName(filename: string, changes: ChangelogItem, order: number) {
    const {date, index} = changes;

    if (typeof index === 'number') {
        return String(index);
    }

    if (date && /^\d{4}/.test(date)) {
        return Math.trunc(new Date(date).getTime() / 1000);
    }

    return `name-${filename}-${String(order).padStart(3, '0')}`;
}
