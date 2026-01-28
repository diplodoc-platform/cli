import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {basename, dirname, extname, join} from 'node:path';
import pmap from 'p-map';
import changelog from '@diplodoc/transform/lib/plugins/changelog';

import {defined} from '~/core/config';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getMarkdownHooks} from '~/core/markdown';
import {isExternalHref} from '~/core/utils';

import {options} from './config';
import {collect} from './collect';

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

                const changelogsMap: Record<string, ChangelogItem[]> = {};

                getMarkdownHooks(run.markdown).Collects.tap('Changelogs', (plugins) => {
                    return plugins.concat(collect(changelogsMap));
                });

                getMarkdownHooks(run.markdown).Resolved.tapPromise(
                    'Changelogs',
                    async (_content, path) => {
                        const changelogs = changelogsMap[path];

                        // TODO: why we handle all changelogs?
                        if (!changelogs || !changelogs.length) {
                            return;
                        }

                        const filename = basename(path, extname(path));
                        const outputDir = dirname(join(run.output, path));

                        changelogs[changelogs.length - 1].source = join(dirname(path), filename);

                        await pmap(changelogs, async (changes, index) => {
                            const changesName = changelogName(filename, changelogs.length - index);
                            const changesPath = join(
                                outputDir,
                                'changelogs',
                                `__changes-${changesName}.json`,
                            );

                            const image = changes.image;
                            if (image && !isExternalHref(image.src)) {
                                const from = join(dirname(join(run.input, path)), image.src);
                                const to = join(dirname(join(run.output, path)), image.src);
                                try {
                                    await run.copy(from, to);
                                } catch (error) {
                                    run.logger.error(`Failed to copy changelog image: ${error}`);
                                }
                            }

                            return run.write(changesPath, JSON.stringify(changes), true);
                        });
                    },
                );
            });
    }
}

function changelogName(filename: string, order: number) {
    return `name-${filename}-${String(order).padStart(3, '0')}`;
}
