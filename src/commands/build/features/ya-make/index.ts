import type {Build, Run} from '~/commands/build';
import type {Command} from '~/core/config';
import type {YaMakeParsed} from '@diplodoc/utils/ya-make';

import {dirname, join} from 'node:path';
import {copyFileSync, existsSync, mkdirSync, unlinkSync} from 'node:fs';
import chokidar from 'chokidar';
import {assembleDir, parseYaMake, resolveTarget} from '@diplodoc/utils/ya-make';

import {getHooks as getBaseHooks} from '~/core/program';
import {defined} from '~/core/config';
import {console} from '~/core/utils';

import {options} from './config';
import {collectWatchPaths, detectArcadiaRoot} from './utils';

export type YaMakeArgs = {
    arcadiaRoot?: string;
};

export type YaMakeConfig = {
    yaMake?: {
        root: string;
        parsed: YaMakeParsed;
        assembledDir: string;
    };
};

export class YaMake {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('YaMake', (command: Command) => {
            command.addOption(options.arcadiaRoot);
        });

        getBaseHooks(program).Config.tapPromise(
            {name: 'YaMake', stage: 10},
            async (config, args) => {
                const yamakePath = join(config.input, 'ya.make');

                if (!existsSync(yamakePath)) {
                    return config;
                }

                const yaMakeRoot =
                    (defined('arcadiaRoot', args, config) as string | undefined) ??
                    detectArcadiaRoot();

                if (!yaMakeRoot) {
                    return config;
                }

                const parsed = parseYaMake(yamakePath, yaMakeRoot);
                const assembledDir = join(config.output, '.ya-make-input');

                await assembleDir(assembledDir, config.input, parsed);

                config.yaMake = {root: yaMakeRoot, parsed, assembledDir};
                config.input = assembledDir;

                return config;
            },
        );

        getBaseHooks<Run>(program).AfterAnyRun.tapPromise(
            {name: 'YaMake', stage: 100},
            async (run) => {
                if (!run.config.watch || !run.config.yaMake) {
                    return;
                }

                const {parsed, assembledDir} = run.config.yaMake;
                const watchPaths = collectWatchPaths(parsed);

                if (!watchPaths.length) {
                    return;
                }

                chokidar
                    .watch(watchPaths, {ignoreInitial: true})
                    .on('all', (type: string, absPath: string) => {
                        try {
                            const target = resolveTarget(absPath, parsed, assembledDir);

                            if (!target) {
                                return;
                            }

                            if (type === 'change' || type === 'add') {
                                mkdirSync(dirname(target), {recursive: true});
                                copyFileSync(absPath, target);
                            } else if (type === 'unlink' && existsSync(target)) {
                                unlinkSync(target);
                            }
                        } catch (error) {
                            console.error('YaMake watcher error:', error);
                        }
                    });
            },
        );
    }
}
