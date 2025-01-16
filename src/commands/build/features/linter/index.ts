import type {Build} from '~/commands/build';
import type {Command} from '~/config';

import {join} from 'node:path';
import {LogLevels} from '@diplodoc/transform/lib/log';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {configPath, resolveConfig, valuable} from '~/config';
import {LINT_CONFIG_FILENAME} from '~/constants';
import {options} from './config';

export type LintArgs = {
    lint: boolean;
};

export type LintRawConfig = {
    lint:
        | boolean
        | {
              enabled: boolean;
              config: string;
          };
};

export type LintConfig = {
    lint: {
        enabled: boolean;
        config: LogLevelConfig;
    };
};

type LogLevelConfig = {
    'log-levels': Record<string, LogLevels | `${LogLevels}`>;
};

// TODO(major): move to separated 'lint' command
export class Lint {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Lint', (command: Command) => {
            command.addOption(options.lint);
        });

        let resolvedPath: AbsolutePath | null = null;

        getBaseHooks(program).Config.tapPromise('Lint', async (config, args) => {
            let lint: LintConfig['lint'] | boolean = {
                enabled: true,
                config: {'log-levels': {}},
            };

            if (valuable(config.lint)) {
                lint = config.lint;
            }

            if (typeof lint === 'boolean') {
                lint = {
                    enabled: lint,
                    config: {'log-levels': {}},
                };
            }

            if (valuable(args.lint)) {
                lint.enabled = Boolean(args.lint);
            }

            config.lint = lint;

            if (config.lint.enabled) {
                const configFilename =
                    typeof config.lint.config === 'string'
                        ? config.resolve(config.lint.config as string)
                        : join(args.input, LINT_CONFIG_FILENAME);

                const lintConfig = await resolveConfig<Partial<LogLevelConfig>>(configFilename, {
                    fallback: {'log-levels': {}},
                });

                config.lint.config = lintConfig as LogLevelConfig;
                resolvedPath = lintConfig[configPath];
            }

            config.lint.config = config.lint.config || {'log-levels': {}};
            config.lint.config['log-levels'] = config.lint.config['log-levels'] || {};
            config.lint.config['log-levels']['MD033'] = config.allowHtml
                ? LogLevels.DISABLED
                : LogLevels.ERROR;

            return config;
        });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tap('Lint', async (run) => {
                if (resolvedPath) {
                    await run.copy(resolvedPath, join(run.output, '.yfmlint'));
                }
            });
    }
}
