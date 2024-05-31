import type {Build} from '../..';
import type {Command} from '~/config';
import { join, resolve } from 'node:path';
import shell from 'shelljs';
import {defined, resolveConfig} from '~/config';
import {LINT_CONFIG_FILENAME} from '~/constants';
import {initLinterWorkers, processLinter} from '~/steps';
import {options} from './config';

export type LintArgs = {
    lint: boolean;
    lintDisabled: boolean;
};

export type LintConfig = {
    lintDisabled?: boolean;
    lint: {
        enabled: boolean;
        config: {
            'log-levels': Record<string, string>;
        };
    };
};

// TODO(major): move to separated 'lint' command
export class Lint {
    apply(program: Build) {
        program.hooks.Command.tap('Lint', (command: Command) => {
            command.addOption(options.lint);
            command.addOption(options.lintDisabled);
        });

        program.hooks.Config.tapPromise('Lint', async (config, args) => {
            const lintDisabled = defined('lintDisabled', args, config) || false;
            const lintEnabled = args.lint !== false || config.lint && config.lint.enabled !== false;
            if (lintDisabled || !lintEnabled) {
                config.lint = {enabled: false, config: {}};
                return config;
            }

            config.lint = config.lint || {};
            config.lint.enabled = true;

            const lintConfig = await resolveConfig<Partial<LintConfig['lint']['config']>>(
                resolve(args.input, LINT_CONFIG_FILENAME),
                {
                    fallback: {},
                },
            );

            lintConfig['log-levels'] = lintConfig['log-levels'] || {};
            lintConfig['log-levels']['MD033'] = config.allowHtml ? 'disabled' : 'error';

            config.lint.config = lintConfig as LintConfig['lint']['config'];

            return config;
        });

        program.hooks.BeforeAnyRun.tapPromise('Lint', async (run) => {
            if (!run.config.lint.enabled) {
                return;
            }

            program.hooks.Run.tapPromise('Lint', async (run) => {
                await processLinter(run);
            });

            program.hooks.AfterRun.for('md').tapPromise('Lint', async (run) => {
                const lintPath = join(run.originalInput, LINT_CONFIG_FILENAME);

                shell.cp(lintPath, run.output);
            });

            await initLinterWorkers(run);
        });
    }
}
