import type {RawLintConfig as YfmLintConfig} from '@diplodoc/yfmlint';
import type {Build} from '~/commands/build';
import type {Command} from '~/core/config';

import {dirname, join} from 'node:path';
import {bold} from 'chalk';
import {LogLevels, getLogLevel, log, normalizeConfig} from '@diplodoc/yfmlint';

import {getHooks as getBaseHooks} from '~/core/program';
import {getHooks as getBuildHooks} from '~/commands/build';
import {getHooks as getLeadingHooks} from '~/core/leading';
import {IncludeInfo, getHooks as getMarkdownHooks} from '~/core/markdown';
import {configPath, resolveConfig, valuable} from '~/core/config';
import {flat, isExternalHref} from '~/core/utils';
import {LINT_CONFIG_FILENAME} from '~/constants';
import {options} from './config';

const EXTENSIONS = /^\S.*\.(md|html|yaml|svg|png|gif|jpg|jpeg|bmp|webp|ico)$/;

export type LintArgs = {
    lint: boolean;
};

export type LintRawConfig = {
    lint:
        | boolean
        | {
              enabled: boolean;
              config:
                  | string
                  | (Hash<Hash<unknown | LogLevels> | LogLevels | false> & {
                        'log-levels'?: Hash<LogLevels>;
                    });
          };
};

export type LintConfig = {
    lint: {
        enabled: boolean;
        config: YfmLintConfig;
    };
};

export class Lint {
    apply(program: Build) {
        getBaseHooks(program).Command.tap('Lint', (command: Command) => {
            command.addOption(options.lint);
        });

        let resolvedPath: AbsolutePath | null = null;

        getBaseHooks(program).Config.tapPromise('Lint', async (config, args) => {
            let lint: LintConfig['lint'] | boolean = {
                enabled: true,
                config: {},
            };

            if (valuable(config.lint)) {
                lint = config.lint;
            }

            if (typeof lint === 'boolean') {
                lint = {
                    enabled: lint,
                    config: {},
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

                const lintConfig = await resolveConfig<Hash>(configFilename, {
                    fallback: {},
                });

                config.lint.config = lintConfig;
                resolvedPath = lintConfig[configPath];
            }

            config.lint.config = config.lint.config || {};

            if ('log-levels' in config.lint.config) {
                const levels = config.lint.config['log-levels'] as Hash<LogLevels>;
                delete config.lint.config['log-levels'];

                config.lint.config = normalizeConfig(levels, config.lint.config);
            }

            config.lint.config['MD033'] = config.allowHtml ? LogLevels.DISABLED : LogLevels.ERROR;

            return config;
        });

        getBuildHooks(program)
            .BeforeRun.for('html')
            .tap('Lint', (run) => {
                getMarkdownHooks(run.markdown).Dump.tapPromise('Lint', async (vfile) => {
                    if (!run.config.lint.enabled) {
                        return;
                    }

                    const deps = flat<IncludeInfo>(await run.markdown.deps(vfile.path));
                    const assets = await run.markdown.assets(vfile.path);
                    const errors = await run.lint(vfile.path, vfile.data, {deps, assets});

                    if (errors) {
                        for (const error of errors) {
                            error.lineNumber = run.markdown.remap(vfile.path, error.lineNumber);
                        }

                        log(errors, run.logger);
                    }
                });

                getLeadingHooks(run.markdown).Dump.tapPromise('Lint', async (vfile) => {
                    if (!run.config.lint.enabled) {
                        return;
                    }

                    const logLevel = getLogLevel(run.config.lint.config, ['YAML001']);

                    if (logLevel === LogLevels.DISABLED) {
                        return;
                    }

                    run.leading.walkLinks(vfile.data, (link: string) => {
                        if (isExternalHref(link) || !EXTENSIONS.test(link)) {
                            return;
                        }

                        if (!run.exists(join(run.input, dirname(vfile.path), link))) {
                            run.logger[logLevel](
                                `Link is unreachable: ${bold(link)} in ${bold(vfile.path)}`,
                            );
                        }
                    });
                });
            });

        getBuildHooks(program)
            .AfterRun.for('md')
            .tapPromise('Lint', async (run) => {
                if (resolvedPath) {
                    await run.copy(resolvedPath, join(run.output, LINT_CONFIG_FILENAME));
                }
            });
    }
}
